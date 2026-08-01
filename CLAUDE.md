# RLS Red Alert

## Product

A single-page hackathon demonstration that:

1. reads SQL migrations from one whitelisted public GitHub repository;
2. detects an intentionally unsafe Supabase RLS policy;
3. validates the finding against our isolated demonstration database;
4. explains and proposes a repair;
5. requires human approval;
6. applies only a trusted predefined policy change;
7. repeats the same test and proves the data leak is closed.

## Scope

- Primary application: Next.js App Router under `src/`.
- No signup, login, onboarding, accounts, billing or dashboard.
- No support for arbitrary production databases.
- Only the authorised repository in `DEMO_GITHUB_REPOSITORY` may be scanned.
- Only the preconfigured demonstration Supabase project may be tested.
- Never fetch `.env`, credentials, keys or unrelated repository files.
- Never execute unrestricted model-generated SQL.
- Do not use a service-role key.
- All secrets remain server-side and must never be committed.
- Optimise for a polished 2–3 minute live demonstration.

## Development workflow

- Work on feature branches only.
- Never push directly to `main`.
- Do not read or expose `.env.local`.
- Review the complete Git diff before committing.
- Run lint, type checking, tests and production build.
- The user reviews and merges pull requests.

## LLM Wiki

This project has an LLM-curated wiki at `docs/wiki/` recording the work done. Read `docs/wiki/index.md` before answering questions that rely on knowledge accumulated here. Full conventions in `docs/wiki/SCHEMA.md`. Ingest and query workflows live in the `llm-wiki` skill.
