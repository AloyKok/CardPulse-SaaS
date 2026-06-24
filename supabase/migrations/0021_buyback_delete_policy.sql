grant delete on table public.buybacks to authenticated;

create policy "members delete buybacks"
on public.buybacks for delete
using (public.is_org_member(org_id));

