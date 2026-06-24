# Vendy

Vendy is the multi-tenant SaaS product for TCG vendors. It is being built from the proven CardPulse internal booth system, but it should be treated as a separate product, codebase, database, and deployment path.

CardPulse remains the current operating system for Aloy's real inventory and sales. Do not point CardPulse production at Vendy development databases.

## Product Positioning

Vendy helps TCG vendors run card shows from a phone:

- Scan labels and complete booth sales quickly.
- Track daily, online, and card-show revenue.
- Record buybacks, show expenses, and net cash.
- Manage singles, slabs, sealed products, and mystery packs.
- Monitor market pricing for supported TCGs.
- Export inventory, sales, and show reports.

This is not intended to become a generic retail POS first. The wedge is mobile-first card-show operations.

## Repository Status

This folder is the duplicated SaaS working copy.

- CardPulse internal app: `/Users/aloykok/Documents/CardPulse Transaction`
- Vendy SaaS project copy: `/Users/aloykok/Documents/Vendy`
- Current branch: `codex/saas-foundation`
- Old internal GitHub remote is preserved as `cardpulse-internal` for reference only.

The current GitHub remote still points to `AloyKok/CardPulse-SaaS` until a Vendy repository is created or the existing repository is renamed.

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- React Router
- Zustand
- TanStack Query
- vite-plugin-pwa
- Supabase Auth, Postgres, RLS, Realtime, Storage, RPC
- Vercel static hosting and API routes
- Stripe, planned for billing

## Local Development

Install dependencies:

```bash
npm install
```

Run local demo mode:

```bash
npm run dev
```

The app can run without Supabase environment variables for local product testing. Local mode is not secure multi-user SaaS mode.

To run against Supabase, copy the environment template:

```bash
cp .env.example .env
```

Fill in:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Server-only values must only be configured in Vercel or local backend `.env` files. Never prefix service-role secrets with `VITE_`.

## SaaS Foundation Work

Before selling this to other vendors, complete these foundation milestones:

1. Keep CardPulse production on its existing database until a deliberate migration is planned.
2. Use separate Supabase projects for Vendy development, staging, and production.
3. Convert hardcoded One Piece config into database-backed TCG configuration.
4. Verify RLS on every org-scoped table.
5. Add tenant onboarding.
6. Add plan and subscription tables.
7. Add Stripe billing in test mode.
8. Add internal superadmin tooling.
9. Add show start and show closing workflows.
10. Run private beta with CardPulse plus 2-5 external vendors.

## Important Docs

- [SaaS architecture](./docs/SAAS_ARCHITECTURE.md)
- [Tenancy and security](./docs/TENANCY_SECURITY.md)
- [Product roadmap](./docs/PRODUCT_ROADMAP.md)
- [Operations runbook](./docs/OPERATIONS.md)

## Deployment Plan

Recommended environments:

- `local`: local demo and local Supabase testing
- `preview`: Vercel preview + Vendy staging Supabase project
- `production`: Vercel production + Vendy production Supabase project

Recommended domains:

- `vendy.app` or another chosen marketing domain
- `app.vendy.app`: SaaS application
- `admin.vendy.app`: optional internal superadmin

Keep CardPulse on its existing production environment until Vendy is stable and a migration is intentionally scheduled.

## Current Verification

Run before every deploy:

```bash
npm run lint
npm run build
```

For SaaS releases, also verify:

- A user from org A cannot read org B rows.
- An admin cannot perform owner-only actions.
- Checkout decrements stock atomically.
- Voiding/restoring sales adjusts inventory correctly.
- Plan limits cannot be bypassed from the browser.
