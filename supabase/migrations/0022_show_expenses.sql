create type public.show_expense_category as enum ('booth_fee', 'parking', 'food', 'transport', 'supplies', 'other');

create table public.show_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.show_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  category public.show_expense_category not null default 'other',
  description text not null,
  amount numeric(12,2) not null,
  payment_method public.payment_method not null default 'cash',
  notes text,
  constraint show_expenses_amount_check check (amount >= 0),
  constraint show_expenses_description_check check (length(trim(description)) > 0)
);

create index show_expenses_org_event_idx on public.show_expenses(org_id, event_id, created_at desc);
create index show_expenses_org_created_at_idx on public.show_expenses(org_id, created_at desc);

alter table public.show_expenses enable row level security;

grant select, insert, update, delete on table public.show_expenses to authenticated;

create policy "members read show expenses"
on public.show_expenses for select
using (public.is_org_member(org_id));

create policy "members insert show expenses"
on public.show_expenses for insert
with check (
  public.is_org_member(org_id)
  and exists (
    select 1
    from public.show_events e
    where e.id = event_id
      and e.org_id = org_id
  )
);

create policy "members update show expenses"
on public.show_expenses for update
using (public.is_org_member(org_id))
with check (
  public.is_org_member(org_id)
  and exists (
    select 1
    from public.show_events e
    where e.id = event_id
      and e.org_id = org_id
  )
);

create policy "members delete show expenses"
on public.show_expenses for delete
using (public.is_org_member(org_id));
