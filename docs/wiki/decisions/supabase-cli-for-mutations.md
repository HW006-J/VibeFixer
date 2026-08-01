---
type: decision
title: "Apply/reset shells out to the local Supabase CLI"
status: accepted
supersedes: null
tags: [repair-flow, demo, security, open-question]
sources: [repository-state-2026-08-01]
created: 2026-08-01
updated: 2026-08-01
---

# Apply/reset shells out to the local Supabase CLI

**Status:** accepted, with a known and documented cost

## Decision

The two mutating steps — apply the trusted repair, reset to the vulnerable state — execute via `supabase db query --linked` through `execFile` on the machine running the app. Everything else (scan, detection, live validation, AI proposal) works over plain HTTPS.

## Rejected alternatives

- **Service-role key** — forbidden outright by `CLAUDE.md`. A service-role key bypasses RLS entirely, which would make a product about RLS enforcement absurd, and `PLAN.md` names a leaked service-role key as the highest-value target for the planned secret detector.
- **Direct Postgres connection** via `SUPABASE_DATABASE_URL` — the variable exists in `.env.example` but is documented as not required by any current tooling; left blank, for manual debugging only.
- **Supabase Management API with a scoped credential** — the correct long-term answer. Explicitly recorded in `README.md` as intentionally out of scope.

## Consequence, accepted

**The demo cannot run from Vercel.** Serverless functions have no CLI, no auth session, and cannot exec an external binary; apply/reset fail there with `CLI_UNAVAILABLE`. `PLAN.md` states it as an operational rule: *"Demo must run LOCALLY — do not demo from Vercel."*

This was accepted because a hackathon demo runs on a known laptop, and the alternative that fits serverless is the one credential the project's threat model forbids.

## What the decision cost in follow-up work

Three of nine merged PRs went to making this path reliable, which is the honest measure of the trade-off:

- `d97f90e` — CLI resolution via `SUPABASE_CLI_PATH` plus known install locations, because GUI- and editor-launched Node processes on macOS don't inherit Homebrew's `PATH`.
- Project-root walking (6 levels) instead of trusting `process.cwd()`, and checking for `supabase/` rather than `supabase/config.toml` — the project was set up with `supabase link` but never `supabase init`, so `config.toml` does not exist here.
- `a02e4bd` / `2d52728` — deriving UI controls from live database state rather than client-side memory, which produced [[live-leak-validation]]'s state-derivation logic.

## Open question

Whether to build the Management API path post-hackathon. It would remove the local-only constraint and make a hosted deployment demoable, at the cost of introducing a scoped elevated credential the current design does without.

## Related

- [[trusted-repair-boundary]]
- [[live-leak-validation]]
- [[project-knowledge-recap]]
