# Operations Runbook

## Environments

Use separate environments.

```text
local       developer testing
staging     private beta / Vercel previews
production  paying vendors
```

Each environment should have its own:

- Supabase project
- Vercel project or Vercel environment
- Stripe mode/account keys
- Cron secrets
- Storage buckets

## Release Checklist

Before production deploy:

```bash
npm run lint
npm run build
```

Manual checks:

- Sign in.
- Switch between core routes.
- Add inventory.
- Complete a sale.
- Void and unvoid a sale.
- Record a buyback.
- Record a show expense.
- Export CSV.
- Verify mobile width has no horizontal overflow.

Security checks:

- Test org A cannot read org B data.
- Test admin cannot remove owner.
- Test frontend bundle contains no service-role key.
- Test exports only include active org rows.

## Backup Policy

For production:

- Enable Supabase point-in-time recovery when available.
- Schedule daily database dumps.
- Keep at least 30 days of backups.
- Test restore process monthly.

Do not commit real backups to git.

## Incident Response

Severity 1:

- Cross-tenant data exposure.
- Checkout recording wrong totals.
- Stock decrement failure causing oversell.
- Service-role key exposed.

Immediate action:

1. Pause affected feature or take app offline.
2. Preserve logs.
3. Identify affected organizations.
4. Restore or correct data through audited SQL.
5. Notify affected vendors if required.
6. Write postmortem before re-enabling.

Severity 2:

- Market provider down.
- CSV export broken.
- Non-critical dashboard metric wrong.

Action:

1. Log issue.
2. Add workaround.
3. Patch in next release.

## Observability To Add

Before public launch:

- Error reporting
- API route logs
- Cron job success/failure logs
- Market refresh failure dashboard
- Slow query monitoring
- Audit log viewer

## Data Handling

Vendor data belongs to the vendor.

Product requirements:

- Owner can export org data.
- Owner can request deletion.
- Deleted subscriptions should not immediately delete data.
- Data retention policy must be documented before launch.

