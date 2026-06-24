# Contributing

## Branches

Use focused branches:

```text
feature/tenant-onboarding
feature/game-config
fix/checkout-stock-race
chore/supabase-rls-audit
```

Codex-created branches may use:

```text
codex/<short-task-name>
```

## Before Committing

Run:

```bash
npm run lint
npm run build
```

For database changes:

- Add a new migration.
- Do not edit historical migrations after they have been applied to shared environments.
- Include RLS policies with every new tenant-owned table.
- Include rollback notes in the PR description when destructive changes are involved.

## Pull Request Checklist

- Scope is clear.
- Screens affected are listed.
- Migration impact is described.
- RLS impact is described.
- Manual test steps are included.
- Mobile layout has been checked.
- No real vendor data is included.

