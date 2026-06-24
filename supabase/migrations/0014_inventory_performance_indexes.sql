create extension if not exists pg_trgm with schema extensions;

create index if not exists inventory_items_org_updated_at_idx
  on public.inventory_items(org_id, updated_at desc);

create index if not exists inventory_items_org_item_type_idx
  on public.inventory_items(org_id, item_type);

create index if not exists inventory_items_org_set_name_idx
  on public.inventory_items(org_id, set_name);

create index if not exists inventory_items_org_condition_idx
  on public.inventory_items(org_id, condition);

create index if not exists inventory_items_item_name_trgm_idx
  on public.inventory_items using gin (item_name extensions.gin_trgm_ops);

create index if not exists inventory_items_set_name_trgm_idx
  on public.inventory_items using gin (set_name extensions.gin_trgm_ops);

create index if not exists inventory_items_card_number_trgm_idx
  on public.inventory_items using gin (card_number extensions.gin_trgm_ops);

create index if not exists inventory_items_item_number_trgm_idx
  on public.inventory_items using gin (item_number extensions.gin_trgm_ops);
