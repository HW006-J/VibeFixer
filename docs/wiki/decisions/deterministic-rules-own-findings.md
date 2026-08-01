---
type: decision
title: "Only the deterministic rule engine may produce a finding"
status: accepted
supersedes: null
tags: [security, scanner]
sources: [repository-state-2026-08-01]
created: 2026-08-01
updated: 2026-08-01
---

# Only the deterministic rule engine may produce a finding

**Status:** accepted · enforced structurally since `9e41dfe` (PR #4)

## Decision

Findings originate exclusively from the rule engine in `src/lib/audit/`. The Gemini layer in `src/lib/ai/` may only rephrase, propose, and suggest. Every claim must cite file and line from the scanned input; output referencing a line that does not exist in the input is discarded in favour of deterministic template text.

## Rejected alternative

Letting the model scan the SQL directly and report what it finds. This is faster to build and covers a broader class of issues — a rule pack of twelve checks will miss things a general model would catch.

## Why

The product's entire value is a security claim made to someone unqualified to check it. A founder shown a fabricated CRITICAL cannot tell it apart from a real one, and a single hallucinated finding in a live demo destroys the credibility of every true finding beside it. Determinism is what makes the output auditable: a finding traces to a named rule, a parsed statement, and a line number.

The corollary is accepted knowingly — the scanner under-reports rather than over-reports, and `noIssueFoundCount` is explicitly documented as not a safety guarantee.

## How it is enforced

Not by convention but by types: `aiReview` is `AiSemanticReview | null` with a `performed: true` literal discriminant, so there is no representable shape for a review that did not happen. See [[anti-hallucination-contract]] for the full mechanism.

## Related

- [[anti-hallucination-contract]]
- [[rls-audit-engine]]
- [[trusted-repair-boundary]]
