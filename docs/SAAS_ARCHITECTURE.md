# Vendy SaaS Architecture

## Goal

Build Vendy as a multi-tenant SaaS for TCG vendors while keeping CardPulse as the existing internal operating system until a deliberate migration is planned.

The first commercial wedge is card-show operations:

- Mobile-first checkout
- Inventory labels
- Buybacks
- Show expenses
- Show close reports
- Market price monitoring

## High-Level System

```text
Vendor device
  -> Vercel-hosted React PWA
  -> Supabase Auth
  -> Supabase Postgres with RLS
  -> Postgres RPC functions for critical mutations
  -> Supabase Realtime for shared inventory updates
  -> Supabase Storage for item photos
  -> Vercel API routes / Edge Functions for market and billing webhooks
  -> Stripe for subscriptions
```

## Tenancy Model

Use shared tables with `org_id` on every tenant-owned row.

One organization equals one vendor business.

Examples:

```text
organizations
memberships
organization_settings
inventory_items
transactions
transaction_line_items
buybacks
show_events
show_expenses
market_mappings
market_price_snapshots
```

Every table above must enforce RLS using the current authenticated user's membership.

## SaaS Tables To Add

The current app already has many operational tables. The SaaS version should add or formalize these:

```text
plans
subscriptions
billing_customers
billing_events
usage_counters
games
game_sets
game_rarities
game_categories
game_market_providers
audit_logs
tenant_invites
superadmin_users
```

## TCG Configuration

Move game-specific values out of frontend constants and into database-backed configuration.

Recommended structure:

```text
games
  id
  code
  name
  default_language
  enabled

game_sets
  id
  game_id
  code
  name
  release_date
  enabled

game_rarities
  id
  game_id
  code
  label
  sort_order
  enabled

game_categories
  id
  game_id
  code
  label
  enabled
```

Inventory should reference `game_id` and preferably `set_id`, while retaining snapshots on transaction line items.

## Critical Backend Functions

These should be Postgres RPC functions or protected server routes, not direct client writes:

- `complete_sale`
- `void_sale`
- `unvoid_sale`
- `close_show`
- `create_buyback`
- `process_buyback_to_inventory`
- `adjust_inventory`
- `create_org_from_onboarding`
- `enforce_plan_limit`

Critical rules:

- Never trust client-supplied cost basis for profit.
- Never trust client-supplied org access.
- Inventory decrement must be atomic.
- Transactions remain immutable except status corrections through audited functions.
- Every correction should create an audit log entry.

## Environments

Use separate Supabase projects:

```text
local/dev       -> developer testing
staging         -> private beta and previews
production      -> paying vendors
```

Do not run experimental migrations against the current internal CardPulse production database.

## Deployment

Recommended Vercel projects:

```text
vendy-preview
vendy-production
```

Recommended domains:

```text
app.vendy.app
admin.vendy.app
```

Keep `cardpulse.net/admin` or the current production app separate until a SaaS migration is intentionally scheduled.
