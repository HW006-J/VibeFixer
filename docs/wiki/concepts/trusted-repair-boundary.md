---
type: concept
title: "The trusted repair boundary"
tags: [repair-flow, security, rls]
sources: [repository-state-2026-08-01]
created: 2026-08-01
updated: 2026-08-01
---

# The trusted repair boundary

The safety mechanism that lets the product write to a real database while satisfying the `CLAUDE.md` constraint *"never execute unrestricted model-generated SQL"* and *"applies only a trusted predefined policy change"*.

## The core idea

[trusted-repair.ts](src/lib/repair/trusted-repair.ts) declares **two** SQL statements as module constants — `REPAIR_SQL` and `RESET_SQL` — built from fixed identifiers (`public.clients`, policy name, `SELECT`, `authenticated`, `trainer_id`). These are the only statements the system will ever execute as a mutation. Nothing from a request body, an AI response, or any external input is interpolated into them.

The AI's proposal is therefore *never executed*. `isTrustedRepairExpression()` performs a strict allowlist comparison — normalise, lowercase, strip whitespace, accept either operand order of `auth.uid() = trainer_id` — and its only job is to decide whether the proposal may be **shown to a human for approval**. The file comment states this directly: "The SQL actually executed on approval is always `REPAIR_SQL` above, never the AI's raw text."

This inverts the usual arrangement. The model is not trusted to write the fix; it is trusted only to *arrive at the fix that was already written*. A correct proposal earns a green light on a pre-existing constant.

## Defence in depth around the executor

[db-admin.ts](src/lib/repair/db-admin.ts) adds four independent guards before any mutation runs:

1. **Project root resolution** — walks up from `cwd` looking for `supabase/`, up to 6 levels, rather than trusting `process.cwd()`.
2. **Link-match check** — reads `supabase/.temp/project-ref` and compares it against the ref extracted from `DEMO_SUPABASE_URL`. A mismatch returns `PROJECT_LINK_MISMATCH` and refuses to run. This is described in-code as "the hard safety boundary that prevents ever mutating a different linked Supabase project."
3. **No shell** — `execFile` with an explicit argument array and `shell: false`. No interpolation surface.
4. **Log redaction** — `sanitizeForLog()` strips any 20+ character token-like string and `key=value` secret pairs before anything reaches a log line, and the HTTP response never carries raw CLI output regardless.

`checkMutationReadiness()` runs `select 1;` through the *identical* resolution path, so a passing preflight genuinely predicts that apply/reset will work rather than being a parallel check that can drift.

## Related

- [[supabase-cli-for-mutations]] — the decision behind the executor mechanism
- [[live-leak-validation]] — how the repair is proven to have worked
- [[anti-hallucination-contract]]
- [[project-knowledge-recap]]
