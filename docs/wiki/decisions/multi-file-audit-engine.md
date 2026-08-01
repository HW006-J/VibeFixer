---
type: decision
title: "Widen the audit engine beyond SQL to four file families"
status: proposed
supersedes: null
tags: [scanner, security, demo, open-question]
sources: [repository-state-2026-08-01]
created: 2026-08-01
updated: 2026-08-01
---

# Widen the audit engine beyond SQL to four file families

**Status:** proposed 2026-08-01 12:36 · implementation prompt at `prompts/PROMPT_4_multi_file_engine.md`

## Decision

Extend the engine from SQL-only to four surfaces: `*.sql` (existing, untouched), `firebase.rules`, source-code credential literals, and `package.json` dependencies, with `.env.example` as an optional fifth. Analyzers dispatch by file type and each returns `AuditFinding[]` in the existing shape; the SQL pipeline is not restructured.

Rationale: a vibe-coded app's attack surface is not only Postgres. Perfect RLS is worthless beside a committed service-role key or a world-writable Firebase rule. See [[rls-audit-engine]] for the pipeline this extends.

## The dangerous part

Widening the fetch allowlist in `fetch-supabase-files.ts` is the highest-risk change in the project, because static scanning runs against **any public GitHub repository** (since PR #3 — see [[demo-target-repository]] for the two-tier model).

A glob such as `.env*` would admit `.env`, `.env.local`, `.env.production`. Public repositories with accidentally committed real `.env` files are common. A security scanner that fetches a stranger's live secrets, renders them on screen, and potentially forwards them to Gemini is a worse outcome than shipping nothing at all.

Required mitigations, all treated as correctness rather than polish:

1. **Explicit allowlist, explicit denylist checked first.** Reject `.env` and every `.env.<anything>` except `.example` / `.sample` / `.template`. Tested directly.
2. **Redaction at detection, never at render.** Evidence reaches the UI, the server logs, and possibly the model — redacting in a component protects none of them. Reuse the `sanitizeForLog` pattern from `db-admin.ts` rather than writing a second implementation.
3. **Secret findings barred from the AI path.** Guarded and tested, not left to the existing `RLS_POLICY_NEEDS_REVIEW` filter staying narrow. See [[anti-hallucination-contract]].
4. **Directory containment.** `src/**` and repository root only; never `node_modules/`, `dist/`, `.git/`.

## The precision trap

Rating `.env.example` CRITICAL for containing `SUPABASE_SERVICE_ROLE_KEY=` would fire on almost every legitimate Supabase repository — that placeholder is *correct practice*. It must discriminate placeholder shapes (`<...>`, `EXAMPLE`, empty, `changeme`) from real-shaped values (known prefixes, JWT structure, entropy), and emit nothing when uncertain.

This is why `.env.example` is ranked last of the four. On the demo-target fixture, whose values are deliberately `EXAMPLE`-marked, the correct behaviour is **silence** — so the rule contributes nothing to the demo while carrying the most false-positive risk.

A related wording trap: an anon key in client code is not a leak, it is public by design. The finding is that it is *hardcoded rather than configured*. Calling it a leak signals to a knowledgeable judge that the tool misunderstands Supabase.

## Verified vs assumed

None of the new families can be proven by execution — only the `public.clients` RLS leak can. `liveValidationAvailable` stays `false` across all new analyzers, and the gate in `run-audit.ts` is not widened. See [[live-leak-validation]].

The report must visibly separate "proven by running it" from "found by reading it." This is the product's credibility and the strongest differentiator on an AI Security track: a hallucinating tool structurally cannot make that distinction, and it costs nothing here because it is already true.

## Priority order

Hard sequence, since feature freeze is 14:30: `firebase.rules` → hardcoded credentials → `package.json` → `.env.example`.

`firebase.rules` ranks first on cost/benefit rather than raw security value, which differs from `PLAN.md`'s ranking of the secret detector as highest-value. Reasoning: it is the cheapest analyzer to build and the only one that earns "general security scanner" rather than "RLS linter," and its auth-only rule mirrors `VIBE_LOGIN_ONLY_POLICY` — the same conceptual error in two policy languages, which is the sharpest thing the rule pack can demonstrate.

## Open questions

- Eight finding cards is a wall; `scan-result.tsx` is already 426 lines rendering four. Grouping and default-collapse become load-bearing rather than polish.
- Whether the dependency analyzer is worth shipping at all without a vulnerability database — it can only claim "deprecated" and "known-outdated major," never "vulnerable," and must not invent CVE numbers.

## Related

- [[rls-audit-engine]] · [[anti-hallucination-contract]] · [[demo-target-repository]] · [[live-leak-validation]]
- [[deterministic-rules-own-findings]] — the under-report-don't-over-report principle the precision trap would violate
- [[newsletter-leak-over-transport-vuln]] — the other proposed fixture addition
