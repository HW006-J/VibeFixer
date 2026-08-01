# Franko demo target — integration contract

When Franko's public hackathon target repository (or committed fixtures on his feature branch)
is available, Vibe Fixer should detect findings **without hardcoding** his filenames or expected
counts.

## Expected signal categories (not file-specific)

| Category | What to look for |
|----------|------------------|
| Supabase RLS | Unsafe or review-tier policies in `supabase/migrations/*.sql` or `supabase/schema.sql` |
| AWS IAM | Policy/trust JSON under paths matched by bounded fetch rules (e.g. `**/iam/**`, `*policy*.json`) |
| Secrets | High-confidence credential patterns in `src/**` or config files (never `.env` from GitHub) |
| Endpoints | Sensitive `app/api/**/route.ts` or `pages/api/**` handlers missing in-file auth |

## How to verify manually

1. Set `DEMO_GITHUB_REPOSITORY` only for authorised live Supabase validation — scanning Franko's repo uses the normal public URL field.
2. Run **Scan repository** against his public GitHub URL.
3. Confirm the executive report lists all four categories when matching files exist.
4. Confirm deterministic counts change when fixtures change — no repository-specific branches in code.

## If his branch is not merged yet

Use the local Vitest fixtures under `src/lib/security/**` as the contract tests. They mirror the
same rules Franko's synthetic credentials and IAM JSON are expected to trigger.

Do not claim scan results for his repository until a real scan has been run against an accessible public URL.
