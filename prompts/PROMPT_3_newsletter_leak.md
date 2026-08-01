# Prompt 3 — run this in the `rls-red-alert-demo-target` repo (the repo we scan)

Adds the newsletter-signup leak: the most relatable vulnerability in the fixture, and
the intended target for the "Open PR" demo beat.

Paste everything below the line into Claude Code / Cursor, opened on
`HW006-J/rls-red-alert-demo-target`.

---

You are working on `rls-red-alert-demo-target`: a deliberately vulnerable Supabase
fixture used as the scan target for the RLS Red Alert hackathon demo today. This repo
is intentionally insecure. It contains no real data, no real secrets, and is never
deployed to production.

Your job in this task is narrow: add **one** new vulnerable migration representing a
newsletter signup list, plus its seed data and answer-key entry. Nothing else.

## Absolute constraints — read first

- DO NOT modify or delete any existing migration in `supabase/migrations/`. The live
  demo depends on the existing cross-tenant leak on `public.clients` (trainer A reads
  trainer B's rows) working exactly as it does now. Only ADD a new migration file with
  a later timestamp.
- Do not touch `public.clients`, its policies, or its seed rows in any way.
- Never add real credentials, API keys, or personal data. Every seeded email must be
  at `@example.com` and obviously fake.
- No service-role key anywhere in this repo.

## Why this table specifically

Every vibe-coded landing page has a newsletter signup. The founder demoing this app
did not think of the mailing list as sensitive data, so it never got a policy. In
reality a subscriber list is personal data under GDPR, and leaking it is a reportable
incident. That gap — "it's just emails" versus "it's a breach notification" — is the
point this fixture makes.

## The migration

Add `supabase/migrations/<later-timestamp>_add_newsletter_subscribers.sql`:

```
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  source text default 'landing_page',
  confirmed boolean default false,
  subscribed_at timestamptz default now()
);
```

Then introduce the flaw. Enable RLS, and create a SELECT policy granted to `anon` with
a `using (true)` clause — so the table looks protected (RLS is on, a Supabase dashboard
shows green) while every subscriber row is readable by anyone holding the public anon
key, which ships in every browser bundle.

Also add an INSERT policy that is genuinely correct and appropriately open — anonymous
visitors *should* be able to subscribe. This matters: it makes the migration look like
someone thought about access control, and it means the fix must narrow SELECT without
breaking signup. A fix that just turns everything off is not the right fix.

Write it the way a rushed developer would. A comment like
`-- allow the signup form to read back the row it just created` above the SELECT policy
is ideal: it gives the mistake a plausible motive. No security commentary, no warnings,
nothing that signposts the flaw. It must look normal.

## Seed data

Append to `supabase/seed.sql` (do not rewrite the file — the existing trainer and
client rows must stay exactly as they are). Insert 8–10 subscribers with obviously fake
but realistic-looking values: `jane.doe@example.com`, `sam.patel@example.com`, and so
on, with a mix of `confirmed` true/false and `source` values like `landing_page`,
`instagram_bio`, `referral`.

Make them look like a real mailing list. The demo shows this result set on screen, and
a list of plausible human names reads as a breach in a way that `test1@test.com` does
not.

## Answer key

Add a row to `VULNERABILITIES.md` following the existing table format:

- File: the new migration
- Flaw: SELECT policy granted to `anon` with `using (true)` on a table of personal data
- Severity: CRITICAL
- Human impact: one sentence, plain English, no jargon — along the lines of "anyone on
  the internet can download your entire mailing list."

## The correct fix, for reference — do NOT apply it here

Record this in `VULNERABILITIES.md` so the expected repair is unambiguous, but leave
the repository vulnerable. The fix is to drop the `anon` SELECT policy entirely: the
signup form does not need to read rows back, only to insert them. The INSERT policy
stays as it is.

State this explicitly in the answer key, because "restrict SELECT to the owner" is the
wrong answer for this table — subscribers are not authenticated and have no owner
column. The right answer is that no client-side role should be able to SELECT from
this table at all.

## Done when

- Exactly one new migration file exists; every pre-existing migration is byte-identical
  to before.
- `supabase/seed.sql` has the new subscribers appended and its original contents
  untouched.
- `VULNERABILITIES.md` has one new CRITICAL row, including the note about why
  owner-scoping is the wrong fix here.
- The SQL is syntactically valid Postgres.
- Committed on a feature branch with a PR opened. Do not merge.

## Sanity check before you finish

Re-read your migration and ask: would this look wrong to someone who just shipped their
first app? If it reads as obviously insecure, soften the framing — not the flaw. The
vulnerability must be real and detectable; the *presentation* must look innocent.
