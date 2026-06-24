create or replace function public.complete_sale(
  p_org_id uuid,
  p_cart jsonb,
  p_discount numeric default 0,
  p_payment_method text default 'cash',
  p_event_id uuid default null,
  p_client_ref text default null,
  p_notes text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.transactions;
  v_line jsonb;
  v_kind text;
  v_item_id uuid;
  v_qty integer;
  v_item public.inventory_items;
  v_misc_name text;
  v_unit_price numeric(12,2);
  v_unit_cost numeric(12,2);
  v_line_total numeric(12,2);
  v_lines jsonb := '[]'::jsonb;
  v_subtotal numeric(12,2) := 0;
  v_cost_total numeric(12,2) := 0;
  v_discount numeric(12,2) := greatest(coalesce(p_discount, 0), 0);
  v_total numeric(12,2);
  v_cost_unknown boolean := false;
  v_transaction public.transactions;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not public.is_org_member(p_org_id, v_user) then raise exception 'not a member of this organization'; end if;
  if nullif(trim(p_client_ref), '') is null then raise exception 'client reference is required'; end if;
  if p_payment_method not in ('cash', 'card', 'other') then raise exception 'invalid payment method'; end if;
  if p_event_id is not null and not exists (
    select 1 from public.show_events where id = p_event_id and org_id = p_org_id
  ) then raise exception 'card show does not belong to this organization'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_client_ref, 0));

  select * into v_existing from public.transactions
  where org_id = p_org_id and client_ref = p_client_ref;
  if found then return v_existing; end if;

  if jsonb_typeof(p_cart) <> 'array' or jsonb_array_length(p_cart) = 0 then
    raise exception 'cart is empty';
  end if;

  for v_line in select * from jsonb_array_elements(p_cart)
  loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'invalid cart line';
    end if;

    v_kind := coalesce(nullif(v_line ->> 'kind', ''), 'inventory');

    begin
      v_qty := coalesce(nullif(v_line ->> 'quantity', '')::integer, 1);
    exception when invalid_text_representation then
      raise exception 'invalid cart line';
    end;

    if v_qty <= 0 then raise exception 'sale quantity must be greater than zero'; end if;

    if v_kind = 'misc' then
      begin
        v_unit_price := nullif(v_line ->> 'unitPrice', '')::numeric;
      exception when invalid_text_representation then
        raise exception 'invalid misc sale amount';
      end;

      if v_unit_price is null or v_unit_price <= 0 then
        raise exception 'misc sale amount must be greater than zero';
      end if;

      v_misc_name := coalesce(nullif(trim(v_line ->> 'name'), ''), 'Others');
      v_line_total := v_unit_price * v_qty;
      v_cost_unknown := true;

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'inventoryItemId', null,
        'itemNameSnapshot', v_misc_name,
        'itemTypeSnapshot', 'misc',
        'productCategorySnapshot', null,
        'itemNumberSnapshot', 'MISC',
        'raritySnapshot', null,
        'artSnapshot', null,
        'categorySnapshot', null,
        'conditionSnapshot', 'N/A',
        'quantity', v_qty,
        'unitPrice', v_unit_price,
        'unitCost', 0,
        'lineTotal', v_line_total,
        'lineProfit', 0,
        'costUnknown', true
      ));

      v_subtotal := v_subtotal + v_line_total;
      continue;
    end if;

    if v_kind <> 'inventory' or nullif(v_line ->> 'inventoryItemId', '') is null then
      raise exception 'invalid cart line';
    end if;

    begin
      v_item_id := (v_line ->> 'inventoryItemId')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid cart line';
    end;

    update public.inventory_items
    set
      quantity = quantity - v_qty,
      status = case
        when quantity - v_qty = 0 then 'sold_out'::public.inventory_status
        else 'in_stock'::public.inventory_status
      end
    where id = v_item_id
      and org_id = p_org_id
      and status <> 'reserved'
      and quantity >= v_qty
    returning * into v_item;

    if not found then
      v_item := null;
      select * into v_item from public.inventory_items where id = v_item_id and org_id = p_org_id;
      raise exception 'insufficient stock for %',
        coalesce(v_item.item_name || ' (' || v_item.item_number || ')', v_item_id::text)
        using errcode = 'P0001';
    end if;

    v_unit_cost := coalesce(v_item.cost_basis, round((v_item.asking_price * 0.20)::numeric, 2));
    v_line_total := v_item.asking_price * v_qty;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'inventoryItemId', v_item.id,
      'itemNameSnapshot', v_item.item_name,
      'itemTypeSnapshot', v_item.item_type,
      'productCategorySnapshot', v_item.product_category,
      'itemNumberSnapshot', v_item.item_number,
      'raritySnapshot', v_item.rarity,
      'artSnapshot', v_item.art,
      'categorySnapshot', v_item.category,
      'conditionSnapshot', v_item.condition,
      'quantity', v_qty,
      'unitPrice', v_item.asking_price,
      'unitCost', v_unit_cost,
      'lineTotal', v_line_total,
      'lineProfit', (v_item.asking_price - v_unit_cost) * v_qty,
      'costUnknown', false
    ));

    v_subtotal := v_subtotal + v_line_total;
    v_cost_total := v_cost_total + (v_unit_cost * v_qty);
  end loop;

  v_discount := least(v_discount, v_subtotal);
  v_total := v_subtotal - v_discount;

  insert into public.transactions(
    org_id, created_by, event_id, line_items, subtotal, discount, total,
    cost_total, gross_profit, cost_unknown, payment_method, status, notes, client_ref
  )
  values (
    p_org_id, v_user, p_event_id, v_lines, v_subtotal, v_discount, v_total,
    v_cost_total, v_total - v_cost_total, v_cost_unknown,
    p_payment_method::public.payment_method, 'completed', nullif(trim(p_notes), ''), p_client_ref
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

with rebuilt as (
  select
    t.id,
    jsonb_agg(updated.updated_line order by lines.ordinality) as new_line_items,
    coalesce(sum(
      coalesce(nullif(updated.updated_line ->> 'unitCost', '')::numeric, 0)
      * coalesce(nullif(updated.updated_line ->> 'quantity', '')::integer, 0)
    ), 0) as new_cost_total,
    bool_or(coalesce(nullif(updated.updated_line ->> 'costUnknown', '')::boolean, false)) as new_cost_unknown
  from public.transactions t
  cross join lateral jsonb_array_elements(t.line_items) with ordinality as lines(line, ordinality)
  cross join lateral (
    select case
      when nullif(lines.line ->> 'inventoryItemId', '') is not null
        and coalesce(nullif(lines.line ->> 'costUnknown', '')::boolean, false)
      then lines.line || jsonb_build_object(
        'unitCost', round((coalesce(nullif(lines.line ->> 'unitPrice', '')::numeric, 0) * 0.20)::numeric, 2),
        'lineProfit', round((
          coalesce(nullif(lines.line ->> 'unitPrice', '')::numeric, 0)
          - round((coalesce(nullif(lines.line ->> 'unitPrice', '')::numeric, 0) * 0.20)::numeric, 2)
        ) * coalesce(nullif(lines.line ->> 'quantity', '')::integer, 0), 2),
        'costUnknown', false
      )
      else lines.line
    end as updated_line
  ) updated
  group by t.id
)
update public.transactions t
set
  line_items = rebuilt.new_line_items,
  cost_total = rebuilt.new_cost_total,
  gross_profit = t.total - rebuilt.new_cost_total,
  cost_unknown = rebuilt.new_cost_unknown
from rebuilt
where t.id = rebuilt.id;

revoke execute on function public.complete_sale(uuid, jsonb, numeric, text, uuid, text, text) from public;
grant execute on function public.complete_sale(uuid, jsonb, numeric, text, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
