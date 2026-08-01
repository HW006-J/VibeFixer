# Prompt 2 — run this in the `rls-red-alert-demo-target` repo (the repo we scan)

Paste everything below the line into Claude Code / Cursor, opened on
`HW006-J/rls-red-alert-demo-target`.

---

You are working on `rls-red-alert-demo-target`: a deliberately vulnerable Supabase
fixture used as the scan target for the RLS Red Alert hackathon demo today. This repo
is intentionally insecure. It contains no real data, no real secrets, and is never
deployed to production. Your job is to make it a realistic-looking vibe-coded app
whose migrations contain a specific, known set of Row Level Security flaws.

## Absolute constraints — read first

- DO NOT modify or delete the existing migration(s) already in
  `supabase/migrations/`. The live demo depends on the existing cross-tenant leak
  (trainer A can read trainer B's rows) working exactly as it does now. Only ADD new
  migration files with later timestamps.
- Never add real credentials, API keys, or personal data. Seed data must be obviously
  fake (Jane Doe, jane@example.com, +44 7700 900000).
- No service-role key anywhere in this repo.
- Keep the README explicit that this repository is deliberately vulnerable and must
  never be deployed publicly or used as a template.

## Domain

A small personal-training SaaS: trainers manage their own clients, session notes,
payments, and progress photos. Multi-tenant — a trainer must only ever see their own
clients. This makes the leak emotionally obvious in a demo: health notes and phone
numbers of strangers.

## Vulnerabilities to introduce (one migration file per scenario)

Add these as separate, sequentially timestamped migrations so each one can be shown as
a distinct finding, and so a single PR can fix one of them cleanly.

1. `..._add_session_notes.sql` — CRITICAL, permissive policy.
   Table `session_notes` (id, client_id, trainer_id, note text, injury_flags text,
   created_at). Enable RLS, then create a select policy `using (true)` with a comment
   above it like `-- TODO: tighten this later`. This is the classic generated-code
   pattern: RLS is on, so a dashboard shows green, but every row is world-readable.

2. `..._add_payments.sql` — CRITICAL, RLS never enabled.
   Table `payments` (id, client_id, trainer_id, amount_cents, status, stripe_ref).
   Create the table, add `grant select, insert on public.payments to anon,
   authenticated;` and never call `alter table ... enable row level security`.

3. `..._add_progress_photos.sql` — HIGH, SECURITY DEFINER bypass.
   Table `progress_photos` (id, client_id, storage_path, taken_at) with correct,
   properly scoped RLS policies — so this table looks safe. Then add a
   `security definer` function `get_client_photos(p_client_id uuid)` that selects from
   it without any `auth.uid()` check, and `grant execute ... to anon`. The function is
   the hole, not the table. This is the finding that proves we do more than keyword
   matching.

4. `..._add_client_directory_view.sql` — MEDIUM, view leaks past RLS.
   A view `client_directory` selecting name, email and phone from the clients table,
   granted to `anon`. Views do not inherit RLS from their base tables in the way most
   people assume — call this out in a code comment written the way a hurried developer
   would write it, not the way a security engineer would.

5. `..._widen_clients_update.sql` — HIGH, broadened policy.
   An `alter policy` (or drop + recreate) on the existing clients table that changes a
   correct `using (auth.uid() = trainer_id)` into `using (auth.role() =
   'authenticated')` for UPDATE, with a commit-style comment
   `-- fix: trainers couldn't update clients after signup flow change`. This is the
   "small wording change silently grants excessive privilege" scenario.

6. `.env.example` plus `src/lib/supabaseClient.ts` — CRITICAL, hardcoded secrets.
   Commit a client file with the Supabase URL and anon key inlined as string literals
   instead of read from env, and an `.env.example` that contains what looks like a
   committed service-role key and a Stripe secret. ALL values must be obviously fake
   and non-functional placeholders — use the literal strings
   `sb_secret_EXAMPLE_NOT_A_REAL_KEY_demo_only`,
   `sk_test_EXAMPLE_NOT_A_REAL_KEY_demo_only` and a JWT-shaped string whose payload
   decodes to `{"demo":"fake"}`. Never paste anything resembling a real credential.
   Add `# FAKE — placeholder for scanner demo` beside each one in `.env.example`, but
   leave the hardcoded ones in the client file uncommented so the scanner has to find
   them.

7. `firebase.rules` — CRITICAL, world-writable rules.
   The app supposedly kept a legacy Firebase project for push notifications. Add a
   rules file with `{"rules": {".read": true, ".write": true}}` at the root plus one
   nested path that looks scoped but is not. This proves the tool reasons about access
   policy generally, not only Postgres RLS, and gives us a second policy language on
   screen.

8. `package.json` — MEDIUM, deprecated and vulnerable dependencies.
   Include a few realistic outdated packages a generated app would carry: `request`
   (deprecated since 2020), `moment` (legacy maintenance mode), an old `jsonwebtoken`
   major (pre-9, signature-verification issues), and an old `node-fetch` 2.x. Do not
   install them — the `package.json` entry is the fixture.

## Also add

- Seed file `supabase/seed.sql` inserting two trainers and 3 fake clients each, so a
  live query visibly returns another trainer's rows. Reuse the existing demo trainer
  identities if the current migrations already define them — do not duplicate them.
- `VULNERABILITIES.md` — a table listing each file, the flaw, the expected severity,
  and the one-line human impact. This is our expected-results fixture: the scanner
  must find exactly these. Mark clearly that it is the answer key.
- Update `README.md`: one paragraph explaining this repo exists only as a scan target
  for RLS Red Alert, with a bold warning not to copy any of it.

## Style

Write the SQL the way an AI code generator or a rushed developer would: reasonable
naming, occasional `-- TODO`, no security commentary in the migration files
themselves. The flaws must be genuinely findable but not signposted — the whole point
is that they look normal.

## Done when

`supabase/migrations/` contains the original files untouched plus the five new ones;
the secrets fixture, `firebase.rules` and the `package.json` fixture are in place;
`VULNERABILITIES.md` lists 4 CRITICAL, 2 HIGH, 2 MEDIUM; the SQL is syntactically
valid Postgres; and the README warning is in place. Commit on a feature branch and
open a PR.

## Reminder on the fake credentials

Every credential-shaped string in this repo must be a non-functional placeholder
containing the word EXAMPLE. Do not generate realistic-looking random keys — a
plausible key in a public repo triggers real secret scanners and wastes someone's
incident response time. If a value could conceivably be mistaken for real, make it
more obviously fake.
