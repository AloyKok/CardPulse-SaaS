# Tenancy And Security

## Non-Negotiable Rule

No tenant can ever read, write, infer, export, or mutate another tenant's data.

For SaaS, this is more important than UI polish.

## Tenant Boundary

Every tenant-owned table must have:

```text
org_id uuid not null references organizations(id)
```

Required tables:

- inventory_items
- transactions
- transaction_line_items
- buybacks
- show_events
- show_expenses
- market_mappings
- market_price_snapshots
- settings
- audit_logs
- tenant_invites

## RLS Pattern

Every org-scoped table needs RLS enabled.

Policy pattern:

```sql
exists (
  select 1
  from memberships m
  where m.org_id = table.org_id
    and m.user_id = auth.uid()
)
```

Owner-only actions must also check:

```sql
m.role = 'owner'
```

## Browser Secrets

The browser may only receive:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CRON_SECRET
MARKET_PROVIDER_SECRET
```

## Critical Mutation Rules

Use Postgres RPC or server-side routes for:

- checkout
- void/unvoid
- stock adjustment
- billing plan changes
- organization creation
- membership changes
- show closing

Do not rely on hidden UI buttons for security.

## Audit Logging

Log these actions:

- Sale completed
- Sale voided
- Sale unvoided
- Inventory adjusted
- Buyback created/edited/deleted
- Show closed/reopened
- Membership added/removed
- Settings changed
- Plan changed
- Export generated

Audit log fields:

```text
id
org_id
actor_user_id
action
entity_type
entity_id
metadata jsonb
created_at
```

## SaaS Release Gate

Before inviting external vendors:

- RLS tested with at least two organizations.
- Owner/admin role tests pass.
- Service-role key is absent from frontend bundles.
- RPC functions reject wrong-org IDs.
- CSV and JSON exports only include the current org.
- Realtime subscriptions are scoped by org.
- Storage bucket policies only allow org members to read org-owned files.

