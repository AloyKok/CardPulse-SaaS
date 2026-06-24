create type public.buyback_status as enum ('completed', 'voided');

create table public.buybacks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  event_id uuid references public.show_events(id) on delete set null,
  seller_name text,
  item_summary text not null,
  item_count integer not null default 1 check (item_count >= 1),
  total_paid numeric(12,2) not null check (total_paid >= 0),
  payment_method public.payment_method not null default 'cash',
  status public.buyback_status not null default 'completed',
  notes text,
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  constraint buybacks_event_org_check check (event_id is null or org_id is not null)
);

create index buybacks_org_created_at_idx on public.buybacks(org_id, created_at desc);
create index buybacks_org_event_idx on public.buybacks(org_id, event_id);
create index buybacks_org_created_by_idx on public.buybacks(org_id, created_by);

alter table public.buybacks enable row level security;

grant select, insert, update on table public.buybacks to authenticated;

create policy "members read buybacks"
on public.buybacks for select
using (public.is_org_member(org_id));

create policy "members insert buybacks"
on public.buybacks for insert
with check (public.is_org_member(org_id) and created_by = auth.uid());

create policy "members update buybacks"
on public.buybacks for update
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

