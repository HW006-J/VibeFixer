---
type: source
title: "RLS Red Alert repository state at a6a02ae"
tags: [rls, scanner, repair-flow, demo, security]
authors: ["Francesco Coccia", "HW006-J"]
url: null
raw: null
ingested: 2026-08-01
created: 2026-08-01
updated: 2026-08-01
---

# RLS Red Alert repository state at a6a02ae

The initial wiki backfill. Rather than a single external document, this source is the repository itself as of commit `a6a02ae` ("Merge pull request #9 — Vibe Fixer security pack"), read in full on 2026-08-01: 68 source files, `CLAUDE.md`/`AGENTS.md`, `PLAN.md`, `CLAUDE_CODE_PROMPT.md`, `README.md`, `.env.example`, `demo-assets/`, and the complete 23-commit history.

No raw copy was taken — the repository is its own raw source and is version-controlled. Re-derive by checking out `a6a02ae`.

## What the repository is

A single-page Next.js 16 App Router demonstration, built for an AI Security hackathon track with a 3-minute live demo slot. It reads Supabase SQL migrations from GitHub, detects unsafe Row Level Security policies with a deterministic rule engine, proves the resulting data leak against an isolated demo database with a real authenticated query, has an LLM explain and propose a repair, requires human approval, applies one fixed pre-approved policy change, and re-runs the identical query to prove the leak is closed.

Target audience for the *output* is explicitly non-technical: founders and "vibe-coders" who shipped without a security team.

## Shape at this revision

- ~7,810 lines across `src/` and `scripts/`; 23 test files, 219 test cases.
- Six modules under `src/lib/`: `audit/` (the rule engine, 24 files — by far the centre of gravity), `repair/`, `supabase/`, `github/`, `ai/`, `scanner/`.
- Seven API routes: `/api/scan`, `/api/live-validate`, and `/api/repair/{preflight,propose,apply,reset,live-state}`.
- Two heavy client components: `security-demo-panel.tsx` (615 lines) and `scan-result.tsx` (426 lines). Not yet given wiki pages — read only at surface level during this backfill.
- Four runtime dependencies only: `next`, `react`, `react-dom`, `@google/genai`. No Supabase JS client — the app talks to Supabase over raw `fetch` against the REST and auth endpoints.

## Where this fits

- [[project-knowledge-recap]]
- [[rls-audit-engine]]
- [[trusted-repair-boundary]]
- [[live-leak-validation]]
- [[anti-hallucination-contract]]
- [[demo-target-repository]]
