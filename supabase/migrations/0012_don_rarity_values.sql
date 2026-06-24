alter table public.inventory_items
  drop constraint if exists inventory_items_rarity_values_check,
  add constraint inventory_items_rarity_values_check check (
    rarity is null or rarity in ('C', 'UC', 'R', 'SR', 'SEC', 'Leader', 'Promo', 'Gold', 'Foil')
  );

notify pgrst, 'reload schema';
