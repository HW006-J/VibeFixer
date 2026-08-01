---
type: entity
kind: product
title: "HW006-J/rls-red-alert-demo-target"
tags: [demo, rls, scanner]
sources: [repository-state-2026-08-01]
created: 2026-08-01
updated: 2026-08-01
---

# HW006-J/rls-red-alert-demo-target

The one repository whose live Supabase deployment may be tested. Configured via `DEMO_GITHUB_REPOSITORY`.

## The two-tier authorisation model

A distinction that is easy to get wrong when reading `CLAUDE.md` alone:

- **Static scanning** works against *any* public GitHub repository. This was widened in `2d8590d` (PR #3) from the original demo-only scanner.
- **Live validation and repair** are restricted to this one configured repository, and within it to one table, `public.clients`.

`require-demo-repository.ts` is the gate. `runAudit` will only set `liveValidationAvailable` on a finding when `isDemoRepository` is true *and* the finding's table matches the live-validation constant.

## Fetch containment

[fetch-supabase-files.ts](src/lib/github/fetch-supabase-files.ts) enforces a path allowlist — `supabase/migrations/*.sql` (regex-anchored) and the exact path `supabase/schema.sql`. No other path is ever requested, which is what implements *"never fetch `.env`, credentials, keys or unrelated repository files."*

Hard limits: 50 files, 200 KB per file, 1 MB total, 10-second request timeout. `GITHUB_TOKEN` is optional and used only to raise rate limits.

## The deployed vulnerability

The demo project hosts `public.clients` with RLS enabled and a deliberately broken policy:

```sql
create policy "Authenticated trainers can view clients" on public.clients
  for select to authenticated using (true);
```

`USING (true)` means any authenticated trainer reads every trainer's clients. Two seeded auth users (Trainer A = attacker, Trainer B = victim) with two rows each make the cross-tenant leak visible. `scripts/setup-demo-environment.mjs` provisions this idempotently and verifies the leak actually reproduces.

## Distinct from the paste asset

`demo-assets/vulnerable-migration.sql` is a *different* artifact — a fictional patients/invoices schema with three planted issues (allow-all `USING (true)`, a table with RLS never enabled but granted to `anon`, and a `SECURITY DEFINER` function executable by `anon`). It targets the not-yet-built `/api/scan-text` paste path and is static-analysis only, with no live database behind it.

## Planned additions

`prompts/PROMPT_2_demo_target.md` specifies eight further fixtures (session notes, payments, progress photos, a leaky view, a broadened policy, hardcoded fake secrets, Firebase rules, stale dependencies) with a `VULNERABILITIES.md` answer key as the expected-results fixture.

`prompts/PROMPT_3_newsletter_leak.md` adds a ninth: an `anon`-readable `newsletter_subscribers` table, intended as the target for the Open-PR demo beat. See [[newsletter-leak-over-transport-vuln]].

## Related

- [[live-leak-validation]]
- [[trusted-repair-boundary]]
- [[project-knowledge-recap]]
