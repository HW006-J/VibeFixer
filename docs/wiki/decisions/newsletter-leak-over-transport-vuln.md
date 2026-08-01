---
type: decision
title: "Newsletter leak as an RLS finding, not a transport-layer one"
status: proposed
supersedes: null
tags: [demo, rls, scanner, open-question]
sources: [repository-state-2026-08-01]
created: 2026-08-01
updated: 2026-08-01
---

# Newsletter leak as an RLS finding, not a transport-layer one

**Status:** proposed 2026-08-01 12:28, during the BUILD 1 window

## The original idea

Add a newsletter signup form that submits over HTTP (or with a deprecated TLS version), have the scanner flag it, and demo the fix by showing submitted data in cleartext before and encrypted after.

## Decision

Keep the newsletter framing; change the vulnerability class. Ship it as a `newsletter_subscribers` table with a SELECT policy granted to `anon` using `true` — a leak provable with an ordinary anon-key request rather than a packet capture.

## Why the transport version was rejected

Five reasons, roughly in order of severity:

1. **The proof would have to be faked.** Demonstrating cleartext requires packet capture — Wireshark, a proxy, the devtools network tab — which cannot be done honestly from inside the Next.js app. A simulated before/after pane contradicts [[anti-hallucination-contract]], the project's central commitment, in the one moment the audience is watching most closely.
2. **It isn't SQL.** The engine parses SQL statements; there is no code path that reads form markup or `fetch` calls. It would need a new parser, rule family, and finding shape. See [[rls-audit-engine]].
3. **It may not be demonstrable at all.** Browsers block mixed content outright, Supabase endpoints are HTTPS-only, and local dev is uniformly `http://localhost` so there is no contrast to show. A separate HTTP listener would have to be stood up purely as demo scaffolding.
4. **Two different bugs were conflated.** Deprecated TLS is a server handshake property, discoverable only by probing a live endpoint — an entirely different scanner from a migration reader.
5. **The fix isn't a policy change.** [[trusted-repair-boundary]] applies fixed SQL to a database. "Use https" is a source edit in another repository, which belongs to the unbuilt open-PR feature, so only half the loop would be exercised.

## What was kept

The framing, which was the strongest part of the original idea. Every vibe-coded landing page has a signup form; the owner does not think of a mailing list as sensitive; under GDPR it is personal data and leaking it is reportable. The "it's just emails" versus "it's a breach notification" gap is a sharper story for a non-technical audience than cross-tenant row access.

## Scope, deliberately limited

Shipped as a **static finding only** — no live validation. Live validation and trusted repair are hardcoded to `public.clients` / `trainer_id` across three of the most safety-critical files in the project, and widening them during a freeze window was judged a worse use of the remaining time than finishing `/api/repair/open-pr`.

Result: two findings, one proven live (clients), one fixed by PR (newsletter), and **zero changes to the scanner application**. `VIBE_ANON_ALLOW_ALL` and `VIBE_PUBLIC_TABLE_RLS_DISABLED` already detect it.

## A detail worth preserving

The correct fix here is to **drop the `anon` SELECT policy entirely**, not to scope it to an owner. Subscribers are unauthenticated and have no owner column, so the usual `auth.uid() = owner_id` repair is simply wrong for this table. The signup form needs INSERT, never SELECT.

This makes the fixture more valuable than a second copy of the clients leak: it is a case where the tool's most common remediation is the wrong answer, which is a good test of whether explanations are reasoned or pattern-matched.

## Open questions

- Whether to generalise live validation to a second table after the hackathon, which would let the newsletter leak be proven live too.
- Whether a transport-security scanner is worth building at all, given it needs live endpoint probing and shares no machinery with the migration reader.

## Related

- `prompts/PROMPT_3_newsletter_leak.md` — the implementation prompt for the demo-target repo
- [[demo-target-repository]] · [[rls-audit-engine]] · [[anti-hallucination-contract]] · [[trusted-repair-boundary]]
