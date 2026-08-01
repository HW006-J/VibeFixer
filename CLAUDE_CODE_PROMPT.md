# Kickoff prompt for Claude Code / Cursor

Paste everything below the line into the agent at the start of the work session.

---

You are working on RLS Red Alert (this repo). Read CLAUDE.md and PLAN.md first and
obey both. Code freeze is 15:45 today — prefer small, working increments on feature
branches, run `npm run lint && npm run test && npm run build` before every PR.

## Product context

RLS Red Alert scans Supabase SQL migrations for Row Level Security misconfigurations,
explains them in plain English, proposes a least-privilege fix, applies it only after
human approval, and proves the leak is closed by re-running a live test. Target users
are NOT technical: founders and vibe-coders who shipped an app without a security
team. Every output must read like a senior security engineer and penetration tester
explaining a finding to a smart non-expert.

## Today's tasks (in priority order)

1. `/api/scan-text` — accept pasted or uploaded SQL, reuse the existing `run-audit`
   pipeline in `src/lib/audit/`. No live validation for pasted input; label results
   "static analysis — not verified against a live database". UI: textarea + file
   input beside the existing repository scanner. Test asset:
   `demo-assets/vulnerable-migration.sql` (must produce 2 CRITICAL + 1 HIGH finding).
2. `/api/repair/open-pr` — after human approval, open a real PR on
   `HW006-J/rls-red-alert-demo-target`: create branch, commit the corrected
   migration, open PR with plain-English body (finding, evidence, fix). Use GitHub
   REST via fetch with `GITHUB_TOKEN` from env (fine-grained, that repo only).
   Never log or expose the token. UI button appears only after approval.
3. Report polish — every finding card shows: severity badge, one-sentence blast
   radius in human terms, the exact SQL lines cited, and the framework tags from the
   knowledge layer below.
4. Scan persistence — save every scan (input hash, timestamp, findings JSON, report)
   to a `scan_reports` table in the demo Supabase project (RLS enabled: our own tool
   must be an example of good RLS). Show a simple "previous scans" list. If time is
   short, fall back to local JSON files under `.scans/` (gitignored).

## Security knowledge layer (make findings credible to non-experts)

Add `src/lib/audit/framework-map.ts`: a STATIC lookup table mapping each finding
type to established security concepts. Do not let the LLM generate these — hardcode
them so they are always correct:

- Every finding gets: the CIA triad property violated (confidentiality / integrity /
  availability), an OWASP reference (e.g. A01:2021 Broken Access Control), a NIST
  CSF function (Identify/Protect/Detect/Respond/Recover) and control family
  reference (e.g. AC-3 Access Enforcement from NIST 800-53), and an ISO/IEC 27001
  Annex A control (e.g. A.8.3 Information access restriction, A.5.15 Access control).
- Principles to reference in explanations: least privilege, zero trust ("never
  trust, always verify"), defense in depth, secure by default.
- The report renders these as small tags with one-line plain-English glosses, e.g.
  "ISO 27001 A.8.3 — the rule that says only the right people may see the data."

## Anti-hallucination rules (non-negotiable)

- Findings come ONLY from the deterministic rule engine in `src/lib/audit/`. The
  LLM (Gemini layer in `src/lib/ai/`) may only: rephrase findings in plain English,
  draft the fix proposal, and write the hardening suggestions. It may never invent a
  finding, a severity, a framework reference, or a policy that was not in the input.
- Every claim in a report must cite file + line from the scanned input. If the LLM
  output references a line that does not exist in the input, discard the output and
  fall back to the deterministic template text.
- Validate all LLM output against a strict schema (already in
  `generate-structured.ts`); on any validation failure, retry once, then fall back —
  never show unvalidated model text to the user.
- When something cannot be verified (e.g. pasted SQL with no live database), the
  report must say so explicitly: "not verified live" instead of guessing.
- Uncertainty is a feature: "we cannot determine X from the input provided" is a
  correct answer, silence or invention is not.

## Data safety

- Scanned SQL may contain sensitive schema details: store it hashed + encrypted at
  rest where possible, never send it anywhere except the Gemini API call already in
  place, never write it into logs or error messages.
- All secrets stay server-side in env vars (see .env.example). Never commit them.
- Keep obeying CLAUDE.md: no service-role key, no arbitrary model-generated SQL
  execution — only the trusted predefined policy changes.

## Definition of done for today

Full demo loop works locally: paste vulnerable-migration.sql → 3 findings with
severity, blast radius, citations, framework tags → repo-scan path still works with
live validation → AI fix proposed → human approves → applied → re-test proves leak
closed → "Open PR" produces a real PR on the demo-target repo → scan saved to
history. Lint, tests, and build green.
