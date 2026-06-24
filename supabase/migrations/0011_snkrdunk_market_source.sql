alter table public.market_mappings
drop constraint if exists market_mappings_source_check;

alter table public.market_mappings
add constraint market_mappings_source_check
check (source in ('yuyutei', 'snkrdunk'));

alter table public.market_mappings
drop constraint if exists market_mappings_source_url_check;

alter table public.market_mappings
add constraint market_mappings_source_url_check
check (
  (source = 'yuyutei' and source_url ~ '^https://yuyu-tei\.jp/(sell|buy)/opc/card/')
  or
  (source = 'snkrdunk' and source_url ~ '^https://snkrdunk\.com/en/trading-cards/[0-9]+/?(\?.*)?$')
);

alter table public.market_price_snapshots
drop constraint if exists market_price_snapshots_source_check;

alter table public.market_price_snapshots
add constraint market_price_snapshots_source_check
check (source in ('yuyutei', 'snkrdunk'));

notify pgrst, 'reload schema';
