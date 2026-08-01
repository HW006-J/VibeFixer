# Prompt 4 — run this in the `rls-red-alert` repo (the scanner app)

Widens the audit engine from SQL-only to four file families, so the scanner produces
the full 8-finding answer key in the demo-target's `VULNERABILITIES.md`.

Paste everything below the line into Claude Code / Cursor, opened on `rls-red-alert`.

---

You are extending RLS Red Alert's audit engine. Read `CLAUDE.md` and `PLAN.md` first
and obey both. Code freeze is 15:45 today, feature freeze 14:30. Work on a feature
branch, run `npm run lint && npm run test && npm run build` before every PR, and land
each file family as its own PR so a half-finished family never blocks the others.

## Goal

Today the engine reads only `supabase/migrations/*.sql` and `supabase/schema.sql`. It
must also reason about three other access-policy and configuration surfaces, so a scan
of the demo-target repository produces all eight findings in its `VULNERABILITIES.md`
answer key, not just the four SQL ones.

The point is not "more rules." It is that a vibe-coded app's real attack surface is not
only Postgres. Perfect RLS is worthless beside a committed service-role key or a
world-writable Firebase rule, and the product should say so.

## Priority order — this is a hard sequence, not a wish list

Land them in this order and stop wherever the clock stops. Each is independently
demoable.

1. **`firebase.rules`** — cheapest path to "we reason about access policy generally,
   not only Postgres." A second policy language on screen is the single strongest
   proof of generality per hour spent. Ship this first.
2. **Hardcoded credentials in source** (`src/**/*.ts`, `*.tsx`, `*.js`) — the highest
   *security* argument (a leaked service-role key makes RLS irrelevant), but it carries
   the redaction and precision work below. Ship second.
3. **`package.json` dependencies** — cheapest of all, lowest demo impact. Filler.
4. **`.env.example`** — highest false-positive risk. Ship last or not at all.

If only one lands, land 1. If two, 1 and 2.

## Non-negotiable: the fetch allowlist

`src/lib/github/fetch-supabase-files.ts` currently permits exactly two path shapes.
Widening it is the most dangerous change in this task, because static scanning works
against **any public GitHub repository**, not only our fixture.

Rules:

- Keep an **explicit allowlist**. Add exact filenames and anchored regexes. Never a
  broad glob.
- Add an **explicit denylist checked first**, which rejects `.env` and every
  `.env.<anything>` **except** `.env.example`, `.env.sample`, `.env.template`. A public
  repo with an accidentally committed real `.env` must be impossible to fetch. Write a
  test asserting `.env`, `.env.local`, `.env.production`, `.env.production.local` are
  all rejected and `.env.example` is accepted.
- Source-file scanning is limited to `src/**` and the repository root — never
  `node_modules/`, `vendor/`, `dist/`, `build/`, `.git/`.
- Keep the existing resource limits (50 files, 200 KB/file, 1 MB total) and re-check
  them against the larger file set. Raise the file cap only if needed, and say so in
  the PR.
- Rename the module if `fetch-supabase-files.ts` stops describing it.

A scanner that exfiltrates real secrets from the repositories it scans is a worse
outcome than shipping nothing. Treat this section as the acceptance criteria for the
whole task.

## Non-negotiable: redaction at detection

`AuditFinding.evidence` is already documented as "Exact, redacted (never containing
secrets) evidence text from the source." Honour it.

- Redact at the moment of detection, never at render. Evidence reaches the UI, server
  logs, and potentially the Gemini API — redacting in a component protects none of
  those.
- Show enough to be actionable, never enough to use: first 4 and last 4 characters at
  most, e.g. `sb_s…only`. Preserve the line number and the variable name; those are
  what make it fixable.
- **Secret findings must never enter the AI path.** `src/lib/ai/semantic-review.ts`
  currently reviews only `RLS_POLICY_NEEDS_REVIEW` findings. Assert this explicitly —
  add a guard and a test that a secret-family finding is never sent to
  `generateStructuredJson`. Do not rely on the existing filter staying narrow.
- Reuse the `sanitizeForLog` pattern from `src/lib/repair/db-admin.ts` rather than
  inventing a second redaction implementation.

## Architecture

Do **not** restructure `runAudit`'s SQL pipeline. It is the most-tested code in the
project and the live demo depends on it. Add alongside it.

Route files to analyzers by type, each returning `AuditFinding[]` in the existing
shape, then concatenate:

```
runAudit(files)
  ├── *.sql            → existing pipeline, UNTOUCHED
  ├── firebase.rules   → analyzeFirebaseRules()
  ├── *.ts/.tsx/.js    → analyzeSourceCredentials()
  ├── package.json     → analyzeDependencies()
  └── .env.example     → analyzeEnvExample()
```

Put the new analyzers in `src/lib/audit/` beside the SQL ones. Each is a pure function
from `ScannedFile` to `AuditFinding[]` — same testability, no I/O.

Type changes required:

- Extend `AuditRuleId` in `types.ts` with the new IDs.
- Extend `AuditFindingObjectType` with `"config" | "dependency" | "source"`. The
  existing `"table" | "view" | "function"` members stay.
- **Update `ALL_RULE_IDS` in `summary.ts` in the same commit.** Its comment already
  warns that it must track `AuditRuleId`; if you skip it, "checks run" silently
  under-reports the rule pack.
- SQL-shaped fields (`table`, `operation`, `role`, `clause`, `expression`) are `null`
  and `roles` is `[]` on non-SQL findings. Do not invent values to fill them.
- Add file-family counts to `AuditCoverage` without removing `policiesInspected` /
  `tablesDiscovered`. The UI and summary read those today.

## Non-negotiable: verified vs assumed

None of these new families can be proven by execution. Only the `public.clients` RLS
leak is live-verifiable.

- `liveValidationAvailable` stays `false` on every finding from every new analyzer. It
  is set in exactly one place in `run-audit.ts`, gated on the demo repository and the
  one live-validation target table. Do not widen that gate.
- Every non-SQL finding sets `confidence` honestly and fills `assumptions` with the
  material assumption it required.
- The UI must visibly separate "proven by running it" from "found by reading it." One
  finding in the demo carries live proof; seven do not, and the report should say which
  is which rather than presenting eight identical-looking cards.

This distinction is the product's credibility. Do not blur it to make the report look
stronger.

## The four analyzers

### 1. `firebase.rules` — CRITICAL

Parse as JSON (it is JSON with a `rules` root; tolerate comments and trailing commas,
and on parse failure emit nothing rather than guessing).

Two rules:

- `VIBE_FIREBASE_PUBLIC_RULE` — CRITICAL. `.read` or `.write` is literal `true` at the
  root or any ancestor path. Everything beneath inherits it.
- `VIBE_FIREBASE_AUTH_ONLY_RULE` — HIGH. A rule whose condition only checks that a user
  is signed in (`auth !== null`, `auth != null`, `auth.uid !== null`) without comparing
  against the path variable that scopes it (e.g. a `push_tokens/$uid` node whose rule
  never compares `auth.uid === $uid`).

The second is the interesting one and mirrors `VIBE_LOGIN_ONLY_POLICY` on the SQL side:
authenticated is not authorized. Say so in the explanation, in those words.

Report the JSON path (`rules/push_tokens/$uid`) as the location and the line number in
the source text.

### 2. Hardcoded credentials in source — CRITICAL

Scan `src/**` and root-level `*.ts`, `*.tsx`, `*.js` for credential-shaped **string
literals assigned to a variable or property**. Do not scan comments. Do not flag values
read from `process.env`.

Detect by shape, not by variable name:

- Supabase URL literal: `https://<ref>.supabase.co`
- JWT shape: three base64url segments separated by dots, first segment decoding to JSON
  containing `"alg"`
- Known secret prefixes: `sb_secret_`, `sk_live_`, `sk_test_`, `rk_live_`, `ghp_`,
  `github_pat_`, `AIza`
- High-entropy strings ≥ 32 chars matching `[A-Za-z0-9_\-]` only — lowest confidence
  tier, and only when assigned to an identifier containing key/secret/token/password

`VIBE_HARDCODED_CREDENTIAL` — CRITICAL when the value is a secret-prefixed or
service-role-shaped literal, HIGH when it is an anon key or project URL (public by
design, but hardcoding still breaks environment separation, so say precisely that
rather than overclaiming).

An anon key in client code is **not** a vulnerability by itself — it is meant to be
public. The finding is that it is hardcoded instead of configured. Get this wording
right; a security tool that calls the anon key a leak tells a knowledgeable judge you
don't understand Supabase.

### 3. `package.json` — MEDIUM

`VIBE_OUTDATED_DEPENDENCY` — MEDIUM, confidence `medium`.

You have **no vulnerability database**. Do not claim CVE knowledge, do not invent CVE
numbers, do not call anything "vulnerable" — say "deprecated" or "known-outdated major."
Hardcode a small static table, in the same spirit as the planned `framework-map.ts`:

| Package | Condition | Note |
|---|---|---|
| `request` | any version | deprecated by maintainers since 2020, unmaintained |
| `moment` | any version | legacy maintenance mode, no longer recommended |
| `jsonwebtoken` | major < 9 | pre-9 majors had signature-verification issues |
| `node-fetch` | major 2.x | superseded; native `fetch` available in modern Node |

Parse semver ranges loosely (`^8.5.1` → major 8). On an unparseable range, emit nothing.
Set `assumptions` to note that the range was read from the manifest and the installed
version was not verified — you never see a lockfile.

### 4. `.env.example` — CRITICAL only when it is real

The precision rule. Every legitimate Supabase project has `SUPABASE_SERVICE_ROLE_KEY=`
in its example env — that is **correct practice**. Flagging it is a false positive that
will fire on almost every repository scanned.

`VIBE_COMMITTED_SECRET_IN_EXAMPLE` — CRITICAL, but **only** when the value looks like a
real credential rather than a placeholder.

- **Placeholder → emit nothing.** Empty, `<...>`, `your-...`, `xxx...`, `changeme`,
  `TODO`, or containing `EXAMPLE`/`SAMPLE`/`PLACEHOLDER`/`FAKE` case-insensitively.
- **Real-shaped → CRITICAL.** Matches the prefix or JWT patterns from analyzer 2 and
  fails every placeholder test above.

When in doubt, emit nothing. A missed finding in an example file costs far less than a
false CRITICAL on a stranger's repository during a live demo.

Note: the demo-target fixture deliberately uses `EXAMPLE`-marked placeholders, so this
analyzer should correctly stay **silent** on it. That is the right behaviour, and it
means this rule contributes nothing to the demo — which is exactly why it is priority 4.

## Tests

Match the existing bar: 23 test files, 219 cases, one `.test.ts` beside each module.

Required cases beyond the obvious:

- Allowlist: `.env`, `.env.local`, `.env.production`, `.env.production.local` rejected;
  `.env.example` accepted; `node_modules/**` rejected.
- Redaction: no analyzer ever emits a full credential in `evidence`, asserted against a
  realistic fake secret.
- AI boundary: a secret-family finding is never passed to the Gemini path.
- `.env.example` placeholder handling: the demo-target's own `EXAMPLE` values produce
  zero findings.
- `ALL_RULE_IDS` in `summary.ts` has the same length as the `AuditRuleId` union — a
  compile-time exhaustiveness check is better than a runtime count if you can express
  one.

## Done when

A scan of `HW006-J/rls-red-alert-demo-target` reproduces its `VULNERABILITIES.md`
answer key: 4 CRITICAL, 2 HIGH, 2 MEDIUM, with correct files and line citations, and
with exactly one finding marked as live-verifiable. Lint, tests, and build green.

## If you run short on time

Cut whole analyzers from the bottom of the priority list. Do **not** cut the allowlist
denylist, the redaction, the AI-path guard, or the verified-vs-assumed separation —
those are correctness, not polish, and a demo that skips them is worse than a demo with
four findings instead of eight.
