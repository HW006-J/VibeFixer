# Prompt 1 — run this in the `rls-red-alert` repo (the scanner app)

Paste everything below the line into Claude Code / Cursor.

---

You are working on RLS Red Alert. Read `CLAUDE.md` and `PLAN.md` first and obey both.
Code freeze is 15:45 today. Work on feature branches, run
`npm run lint && npm run test && npm run build` before every PR, never push to main.

## What this product is (use this framing in all user-facing copy)

AI code generators ship Supabase apps with broken or missing Row Level Security at
scale: a scan of 1,072 vibe-coded Supabase apps found 98% had security issues and 16%
had critical flaws; CVE-2025-48757 covered a generator creating databases with no RLS,
exposing 170+ production apps. Existing scanners only probe a deployed app and tell
you it leaks. We are different in two ways and every piece of UX must make this
obvious:

1. We scan the SQL migrations in the repository, so the hole is caught before deploy.
2. We close the loop — explain, propose a least-privilege fix, get human approval,
   apply real DDL, re-run the same test to prove the leak is gone, and open a PR.

The user is a non-technical founder. Every sentence in the UI must be readable by
someone who does not know what a policy is, while the underlying analysis is
deterministic and precise.

## Tasks, in priority order — do not start the next until the previous is merged

### 1. Paste / upload input (`/api/scan-text`)

Accept raw SQL from a textarea or an uploaded `.sql` file and run the existing
`src/lib/audit/run-audit.ts` pipeline on it. No live validation for this path: label
the result "static analysis — not verified against a live database" everywhere it is
shown. Add the textarea + file input beside the existing repository scanner on the
main page; keep both paths visible at once.

Acceptance: pasting `demo-assets/vulnerable-migration.sql` yields exactly 2 CRITICAL
and 1 HIGH finding (permissive `USING (true)` select policy, table with RLS never
enabled plus anon grant, SECURITY DEFINER function granted to anon).

### 2. Open a pull request with the fix (`/api/repair/open-pr`)

After the human approves the proposed repair, allow opening a real PR on
`DEMO_GITHUB_REPOSITORY`. Implementation: GitHub REST via `fetch` (no new
dependencies), `GITHUB_TOKEN` from env — a fine-grained token scoped to that one
repository. Create a branch `fix/rls-<finding-id>-<timestamp>`, add a new migration
file containing only the trusted predefined policy change, and open a PR whose body
contains the plain-English finding, the evidence (file + line), the fix, and a line
stating a human approved it.

Hard rules: never write the token to logs, responses, or error messages; refuse if
the target repository is not `DEMO_GITHUB_REPOSITORY`; never force-push; never touch
`main` directly.

### 2b. Three new deterministic detector families (only after task 2 is merged)

These broaden the tool from "RLS scanner" to "access and exposure auditor", which is
the pitch. All three are deterministic — no LLM involvement in detection. Build them
in this order and stop wherever the clock runs out; each is independently shippable.

- Secret exposure (`src/lib/audit/secret-rules.ts`) — CRITICAL. Scan repository files
  (not only SQL) for credential patterns: Supabase service-role keys and JWT-shaped
  strings, `sk_live_` / `sk_test_` Stripe keys, `AKIA` AWS access key IDs, generic
  `api_key`/`secret` assignments with a long literal, and Supabase URL + key hardcoded
  in client-side source instead of read from env. REDACT every matched value before it
  is stored, logged, or rendered — show the first 4 characters and the position only,
  never the full string. Flag service-role keys as the highest severity: with one, RLS
  is irrelevant because it bypasses every policy.
- Firebase rules (`src/lib/audit/firebase-rules.ts`) — CRITICAL. Parse `*.rules` /
  `firebase.json` rules blocks and flag `".read": true`, `".write": true`,
  `allow read, write: if true;`, and `if request.auth != null` used as the only
  condition on user-owned data (authenticated is not the same as authorised — say
  exactly that in the explanation). This is the same least-privilege failure as
  `using (true)` in a different language; the report should say so.
- Dependency hygiene (`src/lib/audit/dependency-rules.ts`) — MEDIUM. Read
  `package.json` and flag a small hardcoded list of deprecated or end-of-life
  packages: `request`, `moment` (maintenance only), `jsonwebtoken` below 9,
  `node-fetch` 2.x, `crypto-js` below 4.2. Hardcode the list with a one-line reason
  each — do NOT call any registry or CVE API during a live demo, and do NOT let the
  model invent CVE numbers. If you cannot state a specific, checked reason, do not
  emit the finding.

Every new finding type needs an entry in `framework-map.ts` (task 4) before it ships.

### 3. Report polish

Every finding card shows, in this order: severity badge; one sentence of blast radius
in human terms ("anyone on the internet can read every client's phone number and
training notes"); the exact SQL lines cited with file and line number; the framework
tags from task 4; and the remediation. Add a top-level summary line: "N critical, N
high — your database is currently exposed / no critical issues found."

### 4. Security knowledge layer — `src/lib/audit/framework-map.ts`

A STATIC hardcoded lookup from finding type to established security references. The
LLM must never generate these. For each finding type provide: the CIA triad property
violated; an OWASP reference (e.g. A01:2021 Broken Access Control); a NIST CSF
function plus an 800-53 control family (e.g. PROTECT / AC-3 Access Enforcement); an
ISO/IEC 27001 Annex A control (e.g. A.8.3 Information access restriction); and a
one-line plain-English gloss of each. Render as small tags under each finding.

Copy rule: say "aligned with" these controls, never "compliant with".

### 5. Scan persistence

Save every scan — timestamp, input hash, findings JSON, generated report — so a
"previous scans" list can be shown. Prefer a `scan_reports` table in the demo Supabase
project with RLS enabled and no anon access (our own tool must model good RLS). If
that costs more than 20 minutes, fall back to gitignored JSON files under `.scans/`.

## Anti-hallucination rules (non-negotiable)

- Findings, severities, and framework references come ONLY from the deterministic
  engine in `src/lib/audit/`. The Gemini layer in `src/lib/ai/` may only rephrase
  findings in plain English, draft the repair proposal, and write hardening
  suggestions. It may never invent a finding, a severity, a citation, or a policy
  that is not in the scanned input.
- Every claim must cite file + line present in the input. If model output references
  a line that does not exist, discard it and fall back to the deterministic template.
- Validate all model output against a strict schema (`generate-structured.ts`); on
  failure retry once, then fall back. Never render unvalidated model text.
- Where something cannot be verified, say so explicitly ("not verified live") rather
  than implying it was checked. "We cannot determine this from the input provided" is
  a correct answer.

## Data safety

Scanned SQL reveals schema and business structure. Do not log it, do not include it
in error messages, do not send it anywhere except the existing Gemini call. Any value
matched by the secret detector must be redacted at the point of detection — it must
never reach the Gemini call, the saved scan record, the PR body, or the UI in full. Secrets
stay server-side in env vars only. Keep obeying CLAUDE.md: no service-role key, and
never execute model-generated SQL — only the trusted predefined policy changes.

## Definition of done

Paste the vulnerable SQL → 3 cited findings with severity, blast radius and framework
tags → scan the demo repository → live validation proves a real cross-tenant leak →
AI proposes the fix → human approves → applied → same test re-run returns zero leaked
rows → "Open PR" creates a real PR on the demo-target repo → scan appears in history.
Lint, tests and build green.
