# Security Policy

Vendy handles vendor inventory, sales, buybacks, expenses, staff access, and business reporting. Treat all tenant data as confidential.

## Reporting Issues

For now, report security issues directly to the project owner before public launch.

Do not open public GitHub issues for:

- Cross-tenant data access
- Authentication bypass
- Exposed credentials
- Payment or billing flaws
- Inventory or transaction integrity issues

## Secret Handling

Never commit:

- Supabase service-role keys
- Stripe secret keys
- Stripe webhook secrets
- Cron secrets
- Database dumps
- Vendor exports
- Real customer/vendor data

Browser-exposed variables must use `VITE_` and must be safe for public clients.

## Required SaaS Security Gates

Before external beta:

- RLS tested for two organizations.
- Owner/admin permissions tested.
- Storage policies tested.
- Service-role key absent from frontend build.
- Critical mutations use RPC or server routes.
- Audit logs exist for destructive/corrective actions.
