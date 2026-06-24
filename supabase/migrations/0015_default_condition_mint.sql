alter table public.inventory_items
  alter column condition set default 'MINT';

alter table public.settings
  alter column default_condition set default 'MINT';

update public.settings
set default_condition = 'MINT',
    updated_at = now()
where default_condition = 'NM';
