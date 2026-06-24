# Product Roadmap

## Phase 0: Preserve Internal CardPulse

Do not break the existing internal production app while building SaaS.

Keep `/Users/aloykok/Documents/CardPulse Transaction` as the operating system for real shows until SaaS production is ready.

## Phase 1: SaaS Foundation

Goal: make the current product safe for multiple vendors.

- New Supabase project for SaaS development.
- New GitHub repository.
- New Vercel project.
- Organization onboarding.
- Role-based memberships.
- RLS audit on every org-scoped table.
- Dedicated staging and production environments.
- Internal superadmin account model.

Exit criteria:

- Two test vendors can use the same app without seeing each other's data.
- CardPulse remains a normal tenant, not a hardcoded special case.

## Phase 2: TCG Abstraction

Goal: support more than One Piece without duplicating the product.

- Add `games`.
- Add `game_sets`.
- Add `game_rarities`.
- Add `game_categories`.
- Add game-specific card number validation.
- Convert One Piece constants into seed/config rows.
- Add vendor settings for enabled games.

Exit criteria:

- One Piece runs from database config.
- A second test game can be added without React code changes for sets/rarities.

## Phase 3: Card-Show Operating Workflows

Goal: become clearly better for vendors at shows.

- Show start checklist.
- Show closing workflow.
- Starting cash float.
- Actual cash counted.
- Cash discrepancy.
- Buyback processing summary.
- Expense summary.
- Show report export.
- Cards missing labels.
- Cards missing floor prices.

Exit criteria:

- A vendor can run a whole show from start to close and get a clear result.

## Phase 4: Billing And Plans

Goal: charge safely.

- Stripe customer creation.
- Stripe Checkout or Billing Portal.
- Subscription tables.
- Webhook verification.
- Plan limits.
- Trial plan.
- Past-due access rules.

Possible first plans:

```text
Starter     1 user, limited inventory, limited shows
Vendor      multi-user, inventory, show reports
Team        advanced reports, market tools, higher limits
```

Exit criteria:

- A test tenant can subscribe, cancel, and be limited correctly.

## Phase 5: Private Beta

Goal: learn from real vendors before public launch.

- Invite 2-5 trusted vendors.
- Import their inventory.
- Observe show workflow.
- Collect support issues.
- Fix onboarding friction.
- Improve mobile checkout speed.

Exit criteria:

- At least two external vendors complete a real show using CardPulse.

## Phase 6: Public Launch

Goal: sell the product.

- Marketing site.
- Pricing page.
- Demo video.
- Support email.
- Privacy policy.
- Terms of service.
- Backup/export documentation.
- Incident process.

Exit criteria:

- New vendor can self-serve from signup to first sale.

