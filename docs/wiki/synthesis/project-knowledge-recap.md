---
type: synthesis
title: "Project knowledge recap — RLS Red Alert as of 2026-08-01"
tags: [rls, scanner, repair-flow, demo, security, open-question]
sources: [repository-state-2026-08-01]
created: 2026-08-01
updated: 2026-08-01
---

# Project knowledge recap — RLS Red Alert as of 2026-08-01

Everything known about this project at commit `a6a02ae`, backfilled from the repository, its docs, and its full commit history. The entry point for the wiki.

## What it is

A Next.js 16 single-page demonstration for an AI Security hackathon track. It closes one loop, end to end:

**scan → detect → prove → explain → propose → human approves → apply → re-prove**

Concretely: read Supabase migrations from GitHub, detect unsafe RLS policies with a deterministic rule engine, prove the leak by running a real authenticated query against an isolated demo database, have Gemini explain and propose a least-privilege fix, require a human click, apply one fixed pre-approved policy change, then re-run the identical query and show zero leaked rows.

The audience for every output is explicitly non-technical — founders and vibe-coders who shipped without a security team. The instruction in `CLAUDE_CODE_PROMPT.md` is that output should read like "a senior security engineer and penetration tester explaining a finding to a smart non-expert."

## The one idea worth keeping

Most security tooling asserts. This one **executes**. The difference between "your policy looks unsafe" and "here are two rows belonging to someone else, fetched thirty seconds ago with a real login" is the entire product, and it is also the constraint that shapes every architectural decision below.

## Architecture

| Layer | Location | Role |
|---|---|---|
| Fetch | `src/lib/github/` | path-allowlisted GitHub reads → [[demo-target-repository]] |
| Audit | `src/lib/audit/` (24 files) | the deterministic rule engine → [[rls-audit-engine]] |
| Live proof | `src/lib/supabase/` | real authenticated attack query → [[live-leak-validation]] |
| AI | `src/lib/ai/` | schema-validated rephrasing and proposals → [[anti-hallucination-contract]] |
| Repair | `src/lib/repair/` | fixed-SQL execution + state derivation → [[trusted-repair-boundary]] |
| UI | `src/components/` | `security-demo-panel.tsx` (615 lines), `scan-result.tsx` (426) |

Seven API routes: `/api/scan`, `/api/live-validate`, `/api/repair/{preflight,propose,apply,reset,live-state}`.

Four runtime dependencies: `next`, `react`, `react-dom`, `@google/genai`. Notably **no Supabase JS client** — the app uses raw `fetch` against Supabase's REST and auth endpoints, keeping the dependency surface minimal and the requests fully inspectable.

## The three safety boundaries

The security posture is not a policy document; it is three enforced mechanisms.

1. **Path allowlist on ingest.** Only `supabase/migrations/*.sql` and `supabase/schema.sql` are ever requested. `.env` and credentials are unreachable by construction, not by intent.

2. **The model may phrase, never assert.** Findings come only from deterministic rules. Enforced through the type system with `performed: true` literal discriminants, so "this did not happen" is a distinct representable state that cannot be mistaken for a result. See [[deterministic-rules-own-findings]].

3. **Two SQL constants, no interpolation.** The AI's proposed expression is compared against a trusted constant to decide whether to *offer* it for approval; the SQL actually executed is always the pre-written constant. Plus a link-match guard that refuses to mutate any Supabase project other than the configured demo one.

Underneath all three: no service-role key, ever. A tool arguing for RLS cannot itself bypass RLS.

## Development history

Nine merged PRs, every one on a feature branch, in four phases:

- **PRs #1–#2** — scaffold, then the first GitHub RLS scanner.
- **PR #3** — widened static scanning to any public repository while keeping live validation locked to the one demo repo. This split created the two-tier authorisation model.
- **PR #4** — the pivotal one: a single-rule scanner became a structured audit engine with an inventory model, tiers, confidence, and coverage accounting.
- **PRs #5–#8** — the repair loop, and then three consecutive PRs fixing it. The fix sequence is the real story: model/token-budget correctness → CLI execution reliability → deriving UI state from the live database instead of browser memory → UI simplification.
- **PR #9** — the Vibe Fixer pack: eight `VIBE_*` rules and a deterministic executive summary, plus a fix distinguishing a failed live check from a genuine unavailable status.

The recurring theme across #5–#9 is **replacing assumed state with verified state**. Nearly every bug-fix commit removes a place where the system believed something instead of checking it.

## Current status

Working end to end (locally): repo scan, rule engine, optional AI semantic review, live validation, AI repair proposal, human approval, apply, re-verify, reset.

23 test files, 219 test cases. **Not verified on this machine** — `node_modules` is absent, so `npm run lint && npm run test && npm run build` has not been run here.

Uncommitted in the working tree: `PLAN.md`, `CLAUDE_CODE_PROMPT.md`, `demo-assets/`, and this wiki.

## Known gaps

- **`/api/scan-text`** — paste/upload path. The test asset `demo-assets/vulnerable-migration.sql` exists and expects 2 CRITICAL + 1 HIGH, but the route does not exist yet.
- **`/api/repair/open-pr`** — open a real PR with the fix. Described in `PLAN.md` as "the wow feature," to be preferred over the paste path if only one can land.
- **`framework-map.ts`** — static CIA/OWASP/NIST/ISO tags per finding type, deliberately hardcoded rather than model-generated.
- **Secret detector** — a leaked service-role key makes RLS irrelevant, which is why `PLAN.md` ranks it highest of the proposed new rule families.
- **Scan persistence** — a `scan_reports` table, itself RLS-enabled, on the principle that the tool should be an example of good RLS.
- **Vercel deployment of apply/reset** — blocked by design; see [[supabase-cli-for-mutations]].
- **`README.md`** — still the stock `create-next-app` boilerplate apart from a good "Known limitations" section. `PLAN.md` allocates 15:05–15:35 to rewriting it.

## Operational knowledge

Worth keeping separate from the code, because losing it breaks a demo:

- **Demo locally, never from Vercel.** Apply/reset need the linked, authenticated CLI.
- Pre-flight checklist from `PLAN.md`: Supabase CLI linked, apply+reset working, Gemini key live, GitHub token working, demo-target scan still showing the live leak.
- Identified risks: GitHub token scope, Gemini flaky on venue Wi-Fi (mitigation: cache one good proposal as a canned fallback), expired CLI session, live demo failure (mitigation: record a backup video).
- The demo runs in five beats over three minutes; the scripted line at the approval step is to say "human in the loop" out loud.

## Open questions

- Whether to build the Management API mutation path post-hackathon, trading a scoped elevated credential for a hostable demo.
- Whether the twelve-rule pack's deliberate under-reporting needs a clearer UI statement than the `noIssueFoundCount` field comment currently provides.

## Related

- [[repository-state-2026-08-01]] — the source this was compiled from
- [[rls-audit-engine]] · [[live-leak-validation]] · [[trusted-repair-boundary]] · [[anti-hallucination-contract]]
- [[demo-target-repository]]
- [[deterministic-rules-own-findings]] · [[supabase-cli-for-mutations]] · [[newsletter-leak-over-transport-vuln]]
