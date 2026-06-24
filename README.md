# CardPulse SaaS

CardPulse SaaS is the commercial version of the CardPulse card-show operating system. It starts from the proven internal booth app and evolves it into a multi-tenant product for TCG vendors.

The first production tenant is CardPulse. Future tenants are other vendors, each isolated by organization, roles, row-level security, and plan limits.

## Product Positioning

CardPulse helps TCG vendors run card shows from a phone:

- Scan labels and complete booth sales quickly.
- Track daily, online, and card-show revenue.
- Record buybacks, show expenses, and net cash.
- Manage singles, slabs, sealed products, and mystery packs.
- Monitor market pricing for supported TCGs.
- Export inventory, sales, and show reports.

This is not intended to become a generic retail POS first. The wedge is mobile-first card-show operations.

## Repository Status

This folder is a duplicated SaaS working copy of the internal CardPulse app.

- Current internal app: `/Users/aloykok/Documents/CardPulse Transaction`
- SaaS project copy: `/Users/aloykok/Documents/CardPulse SaaS`
- Current branch: `codex/saas-foundation`
- Old internal GitHub remote is preserved as `cardpulse-internal` for reference only.

Create a new GitHub repository for the SaaS version before pushing this branch.

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

The app runs without Supabase environment variables for local product testing. Local mode is not secure multi-user SaaS mode.

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

1. Create a new Supabase project for SaaS development.
2. Convert all hardcoded One Piece config into database-backed TCG configuration.
3. Verify RLS on every org-scoped table.
4. Add tenant onboarding.
5. Add plan and subscription tables.
6. Add Stripe billing in test mode.
7. Add internal superadmin tooling.
8. Add show start and show closing workflows.
9. Run private beta with CardPulse plus 2-5 external vendors.

## Important Docs

- [SaaS architecture](./docs/SAAS_ARCHITECTURE.md)
- [Tenancy and security](./docs/TENANCY_SECURITY.md)
- [Product roadmap](./docs/PRODUCT_ROADMAP.md)
- [Operations runbook](./docs/OPERATIONS.md)

## Deployment Plan

Recommended environments:

- `local`: local demo and local Supabase testing
- `preview`: Vercel preview + SaaS staging Supabase project
- `production`: Vercel production + SaaS production Supabase project

Recommended domains:

- `cartpulse.net` or `cardpulse.net`: marketing and public landing
- `app.cardpulse.net`: SaaS application
- `admin.cardpulse.net`: optional internal superadmin

Keep the current internal app on its existing production environment until the SaaS project is stable.

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

