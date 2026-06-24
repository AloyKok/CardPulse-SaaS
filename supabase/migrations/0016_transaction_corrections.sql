create or replace function public.update_transaction_sale_source(
  p_org_id uuid,
  p_transaction_id uuid,
  p_event_id uuid default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_transaction public.transactions;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  if not public.is_org_member(p_org_id, v_user) then
    raise exception 'not a member of this organization';
  end if;

  if p_event_id is not null and not exists (
    select 1 from public.show_events where id = p_event_id and org_id = p_org_id
  ) then
    raise exception 'show event not found';
  end if;

  update public.transactions
  set event_id = p_event_id
  where id = p_transaction_id and org_id = p_org_id
  returning * into v_transaction;

  if not found then
    raise exception 'transaction not found';
  end if;

  return v_transaction;
end;
$$;

create or replace function public.unvoid_sale(p_org_id uuid, p_transaction_id uuid)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_transaction public.transactions;
  v_line jsonb;
  v_item_id uuid;
  v_qty integer;
  v_item_name text;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  if not public.is_org_member(p_org_id, v_user) then
    raise exception 'not a member of this organization';
  end if;

  select * into v_transaction
  from public.transactions
  where id = p_transaction_id and org_id = p_org_id
  for update;

  if not found then
    raise exception 'transaction not found';
  end if;

  if v_transaction.status = 'completed' then
    return v_transaction;
  end if;

  for v_line in select * from jsonb_array_elements(v_transaction.line_items)
  loop
    if nullif(v_line ->> 'inventoryItemId', '') is null then
      continue;
    end if;

    v_item_id := (v_line ->> 'inventoryItemId')::uuid;
    v_qty := (v_line ->> 'quantity')::integer;
    v_item_name := coalesce(v_line ->> 'itemNameSnapshot', v_line ->> 'itemNumberSnapshot', 'item');

    update public.inventory_items
    set
      quantity = quantity - v_qty,
      status = case
        when quantity - v_qty = 0 then 'sold_out'::public.inventory_status
        else 'in_stock'::public.inventory_status
      end
    where id = v_item_id
      and org_id = p_org_id
      and quantity >= v_qty
      and status <> 'reserved';

    if not found then
      raise exception 'insufficient stock to revert void for %', v_item_name;
    end if;
  end loop;

  update public.transactions
  set status = 'completed', voided_at = null, voided_by = null
  where id = p_transaction_id and org_id = p_org_id
  returning * into v_transaction;

  return v_transaction;
end;
$$;

revoke execute on function public.update_transaction_sale_source(uuid, uuid, uuid) from public;
revoke execute on function public.unvoid_sale(uuid, uuid) from public;
grant execute on function public.update_transaction_sale_source(uuid, uuid, uuid) to authenticated;
grant execute on function public.unvoid_sale(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
