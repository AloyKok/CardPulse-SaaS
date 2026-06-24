create type public.buyback_processing_status as enum ('unprocessed', 'partially_processed', 'processed');

alter table public.buybacks
  add column processing_status public.buyback_processing_status not null default 'unprocessed',
  add column processed_at timestamptz;

create index buybacks_org_processing_idx
  on public.buybacks(org_id, processing_status, created_at desc);

