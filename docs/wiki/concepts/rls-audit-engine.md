---
type: concept
title: "The RLS audit engine"
tags: [rls, scanner, security]
sources: [repository-state-2026-08-01]
created: 2026-08-01
updated: 2026-08-01
---

# The RLS audit engine

The deterministic core of the product, in `src/lib/audit/`. It is the *only* thing permitted to produce a finding — see [[anti-hallucination-contract]]. Everything else in the system either feeds it input or presents its output.

## Pipeline

`runAudit(repository, isDemoRepository, files)` in [run-audit.ts](src/lib/audit/run-audit.ts) runs four stages:

1. **Discover statements** — `discover-statements.ts` splits raw SQL into statements; `parse-policy.ts`, `parse-function.ts`, `parse-view.ts` extract structured records.
2. **Build inventory** — `build-inventory.ts` produces a schema/RLS model: tables, whether RLS is enabled, policies per table, functions, views.
3. **Run rules** — `run-rules.ts` (442 lines, the largest file) plus `security-definer-rules.ts` emit findings.
4. **Optional AI review** — only `RLS_POLICY_NEEDS_REVIEW` findings, capped at `MAX_AI_REVIEWS_PER_SCAN = 5`, and only when `GEMINI_API_KEY` is set. The result is *attached* to a finding, never allowed to create one.

## The rule pack

Twelve rules, enumerated in `AuditRuleId` ([types.ts](src/lib/audit/types.ts)) and mirrored as a runtime array in [summary.ts](src/lib/audit/summary.ts) — the duplication is deliberate, because TypeScript can't enumerate a union at runtime and "checks run" in the executive summary must reflect the real pack size.

Four original rules (`RLS_*`) plus eight "vibe" rules (`VIBE_*`) added in the security pack. The `VIBE_*` set targets mistakes that look correct to a non-expert:

| Rule | Catches |
|---|---|
| `VIBE_ANON_ALLOW_ALL` | allow-all reachable by the `anon` role |
| `VIBE_PUBLIC_TABLE_RLS_DISABLED` | a table exposed with no RLS at all |
| `VIBE_LOGIN_ONLY_POLICY` | `auth.uid() is not null` — authenticated ≠ authorized |
| `VIBE_NON_NULL_OWNER_POLICY` | `owner_id is not null` — proves a column is set, not that *you* own it |
| `VIBE_USER_METADATA_AUTHORIZATION` | authorizing on user-editable JWT metadata |
| `VIBE_PERMISSIVE_POLICY_BROADENING` | a permissive policy silently widening another |
| `VIBE_SECURITY_DEFINER_SEARCH_PATH` | `SECURITY DEFINER` without a pinned `search_path` |
| `VIBE_SECURITY_DEFINER_VIEW` | a definer view bypassing the underlying table's RLS |

## Two orthogonal axes

A finding carries both a `tier` (`critical` / `high` / `review`) and a `confidence` (`high` / `medium` / `low`), and the type comments are explicit that these are independent: tier is *how bad*, confidence is *how sure the classifier is about this specific classification*. A finding can also carry an `assumptions` string — the material assumption the scanner had to make — which is null when none was needed.

## Honest coverage accounting

`AuditCoverage` counts `noIssueFoundCount` for policies that matched a known tenant-scoping pattern, and the field comment states plainly that this is **not a safety guarantee**. `SecuritySummary` is computed deterministically from the report by `computeSecuritySummary` — no model call — and its `liveVerification.performed` flag is true only when a real live check actually ran in that session. See [[live-leak-validation]].

## Proposed extension

[[multi-file-audit-engine]] would dispatch by file type to add `firebase.rules`, source-credential, and dependency analyzers alongside the SQL pipeline, leaving that pipeline untouched.

## Where this fits

- [[project-knowledge-recap]]
- [[anti-hallucination-contract]]
- [[live-leak-validation]]
