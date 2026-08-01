# RLS Red Alert — race plan (code freeze 15:45)

Track: AI Security · Team: up to 3 · Demo: 3 min live loop

## Where we are (12:15)

Already working: GitHub repo scan (demo-target), rule engine + AI semantic review,
live validation against demo Supabase, AI repair proposal, human approval, apply/reset
via local Supabase CLI, re-test proving leak closed. Tests exist. Demo must run
LOCALLY (apply/reset needs the linked Supabase CLI — do not demo from Vercel).

Missing vs MVP: (1) paste/upload input, (2) open PR with the fix.
Needs polish: plain-English critical report, hardening suggestions panel.

## Timeboxes (revised — 3.5 hours to code freeze)

- 12:15–13:45 · BUILD 1 (parallel)
  - A. Paste/upload path: new `/api/scan-text` route reusing `run-audit` on raw SQL.
    UI: textarea + file input next to repo scanner. Pasted input = static analysis
    only (no live-validate) — label it clearly. Acceptance:
    `demo-assets/vulnerable-migration.sql` → 2 CRITICAL + 1 HIGH.
  - B. Open PR: `/api/repair/open-pr` route. Fine-grained GitHub token (write on
    demo-target only, create it NOW). Flow: create branch → commit fixed migration →
    open PR with plain-English body + evidence. Button appears only after human
    approval. Raw GitHub REST via fetch, no new deps.
  - In a third window: run `prompts/PROMPT_2_demo_target.md` on the demo-target repo.
- 13:45–14:30 · BUILD 2 (parallel)
  - C. Report polish + `framework-map.ts` (CIA / OWASP / NIST / ISO tags, hardcoded).
  - D. Secret detector (highest-value of the three new families — a service-role key
    makes RLS irrelevant). Redact matches at detection. Firebase rules and dependency
    hygiene only if C and D land early.
  - Merge everything by 14:30. FEATURE FREEZE — no new features after this.
- 14:30–15:05 · Rehearse the full demo twice on the demo laptop. Record a backup
  screen video on the second run. Verify: Supabase CLI linked, apply+reset works,
  Gemini key live, GitHub token works, demo-target scan still shows the live leak.
- 15:05–15:35 · Submission: README product rewrite (pitch, architecture, safety
  design), screenshots, submit form.
- 15:35–15:45 · Buffer. Nothing new after 15:35.

## Work split

3 people: P1 = task A + C · P2 = task B + D · P3 = demo script, README/submission,
continuous QA of main, keeps the demo environment sacred.
2 people: P1 = A + C · P2 = B + D · both split P3's list at 14:15.

Rules: feature branches only, PR into main, never break the working loop. If A or B
slips past 13:30, cut it — the existing loop alone is demoable; B (PR) is the wow
feature, prefer B over A if forced to choose.

## Demo script (3 min)

1. "Vibe-coded apps ship RLS holes." Paste vulnerable migration (or scan repo) →
   CRITICAL finding in plain English, cited line. (30s)
2. Prove it: live query as anon → leaked rows on screen. Not a lint warning — a real
   breach. (30s)
3. AI proposes least-privilege fix + hardening checklist → human approves (say
   "human in the loop" out loud). (45s)
4. Apply trusted policy → re-run same query → zero rows. Leak closed, proven. (45s)
5. Click "Open PR" → real PR appears on GitHub with the fixed migration. (30s)

Judging criteria callouts while demoing: real DDL not mocks (technical execution),
proven leak closed (security impact), scan→propose→approve→apply (AI autonomy +
safety), plain English (UX clarity), PR into the dev workflow (real-world fit).

## Risks

- GitHub token missing scope → create fine-grained token first thing, test with curl.
- Gemini flaky on venue Wi-Fi → cache one good proposal as canned fallback.
- Supabase CLI session expired on demo laptop → verify `supabase db query` now.
- Live demo dies → backup video recorded at 14:50.
