---
type: concept
title: "Live leak validation and state derivation"
tags: [rls, demo, security, repair-flow]
sources: [repository-state-2026-08-01]
created: 2026-08-01
updated: 2026-08-01
---

# Live leak validation and state derivation

What separates this product from a linter: the finding is *executed*, not merely asserted.

## The attack, performed for real

[live-validate.ts](src/lib/supabase/live-validate.ts) signs in as a pre-seeded test user (Trainer A, the "attacker") via a genuine password grant against `/auth/v1/token`, then queries `public.clients` through the REST endpoint using that user's own bearer token. Rows in the response whose `trainer_id` differs from the authenticated `userId` are the leak — counted as `leakedRowCount`, with the offending rows returned for display.

Nothing is mocked, and the session is not fabricated. Both requests carry a 10-second `AbortController` timeout, and every failure mode is a distinct typed code (`SIGN_IN_FAILED`, `QUERY_FAILED`, `TIMEOUT`, `NETWORK_ERROR`, `SERVER_MISCONFIGURED`) rather than a generic error.

## Two facts, cross-checked

[live-state.ts](src/lib/repair/live-state.ts) is the more interesting piece. It refuses to trust anything the browser remembers about a prior apply or reset. Instead it gathers two independent live facts in parallel — the deployed `USING` expression read from `pg_policies`, and a fresh run of the identical attacker query — and only reports `vulnerable` or `protected` when **both agree**:

| Policy expression | Query evidence | Reported |
|---|---|---|
| literal `true` | leaked rows > 0 | `vulnerable` |
| trusted repair | leaked = 0 **and** own rows > 0 | `protected` |
| anything else, or the two disagree | — | `unexpected`, with a specific reason |

The `unexpected` branch is the point. A policy that *looks* fixed but still leaks, or a repair with no owned rows to confirm it, is reported as unexplained rather than rounded to the nearest happy answer. The doc comment: "never claims 'protected' or 'vulnerable' on partial or contradictory evidence."

A late fix (`03fb0c4`) further split *"the live check itself failed"* from *"the check ran and reports unavailable"* — a distinction that matters on stage, where a flaky venue network must not be mistaken for a secure database.

## Scope containment

Live validation is bound to exactly one table (`public.clients`) on exactly one repository. `runAudit` sets `liveValidationAvailable` only when `isDemoRepository` is true *and* the finding's table normalises to that constant — and `run-audit.ts` deliberately duplicates the table name as a local constant rather than importing from the repair module, to keep the static engine free of any dependency on live-demo machinery.

## Related

- [[trusted-repair-boundary]]
- [[rls-audit-engine]]
- [[demo-target-repository]]
- [[project-knowledge-recap]]
