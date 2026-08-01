---
type: concept
title: "The anti-hallucination contract"
tags: [security, scanner, demo]
sources: [repository-state-2026-08-01]
created: 2026-08-01
updated: 2026-08-01
---

# The anti-hallucination contract

A rule running through the whole codebase: **the LLM may phrase, never assert.** It is stated as policy in `CLAUDE_CODE_PROMPT.md` and enforced structurally in the type system.

## What the model is allowed to do

Three things, all additive to a finding that already exists:

1. Give a semantic opinion on a policy the deterministic rules could not classify (`RLS_POLICY_NEEDS_REVIEW` only, capped at 5 per scan).
2. Draft a repair proposal for the one confirmed demo vulnerability.
3. Write plain-English explanations and hardening suggestions.

It may never invent a finding, a severity, a framework reference, or a policy that was not in the input.

## How the type system enforces it

The `AuditFinding.aiReview` field is `AiSemanticReview | null`, where the non-null variant is `{ performed: true, ... }` — a literal-true discriminant. There is no `{ performed: false }` shape to accidentally render as a real review. The comment is blunt: *"Only present when a real model call was made for this finding. Never fabricated."*

The same pattern repeats in `RepairProposalResult` (`{ performed: true, ... } | { performed: false }`) and in `SecuritySummary.liveVerification.performed`. Across the codebase, "we did not do this" is a distinct representable state rather than a default or an absence — so an unconfigured API key, a failed call, and a blocked response all collapse to *nothing happened*, and callers cannot mistake that for a result.

## Structured output, then fallback

`generateStructuredJson` validates every model response against a strict JSON schema with `additionalProperties: false`. Validation failure means the output is discarded, not shown. `proposeRepair` returns `{ performed: false }` on any key-missing, failed, blocked, or incomplete outcome, and the doc comment instructs callers to "never treat that as a proposal having happened."

Prompts are constrained too. The semantic-review prompt tells the model to "base your assessment strictly on the SQL shown — do not assume anything about the schema, other policies, or application code that isn't shown," and its enum forces a third option, `uncertain`, alongside safe/unsafe.

## Uncertainty as a product feature

The stated rule is that *"we cannot determine X from the input provided"* is a correct answer and silence or invention is not. This shows up in shipped surfaces: the `assumptions` field on every finding, the `uncertain` assessment enum, the `unexpected` live state, the `noIssueFoundCount` field explicitly labelled as not a safety guarantee, and the requirement that pasted SQL be labelled "static analysis — not verified against a live database."

Even `scripts/setup-demo-environment.mjs` follows it: after seeding, it signs in and checks whether the leak actually reproduces, and "if they were not, the script says so — it never fabricates a pass."

## Related

- [[deterministic-rules-own-findings]] — the decision this contract implements
- [[rls-audit-engine]]
- [[trusted-repair-boundary]]
- [[project-knowledge-recap]]
