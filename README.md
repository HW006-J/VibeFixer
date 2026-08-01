This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

Vibe Fixer deploys to Vercel as a standard Next.js App Router project — import the GitHub
repository at [vercel.com/new](https://vercel.com/new) and set the following environment
variables on the Vercel project (Project Settings → Environment Variables), matching
`.env.example`:

- `DEMO_GITHUB_REPOSITORY`
- `DEMO_SUPABASE_URL`, `DEMO_SUPABASE_ANON_KEY`
- `DEMO_ATTACKER_EMAIL`, `DEMO_ATTACKER_PASSWORD`, `DEMO_VICTIM_EMAIL`, `DEMO_VICTIM_PASSWORD`
- `GEMINI_API_KEY`, `GEMINI_MODEL` (optional — see below)
- `GITHUB_TOKEN` (optional, raises the GitHub API rate limit)

Do **not** set `SUPABASE_CLI_PATH` or `SUPABASE_DATABASE_URL` on Vercel — they're only
meaningful for the local CLI mutation mechanism described below, which cannot run there.

On Vercel, this genuinely supports: public GitHub repository scanning, the full deterministic
security-check pack, the executive summary, real live validation against the authorised demo
Supabase project, and real Gemini repair-proposal analysis — all of it over plain HTTPS. The
UI derives this from a real server-side capability check
(`GET /api/deployment-capabilities`, `src/lib/deployment/capabilities.ts`) rather than
assuming it — see "Known limitations" below for the one thing that's genuinely different.

## Known limitations

**Policy apply and demo reset require the authenticated local Supabase CLI — genuine and
fully supported locally, unavailable on Vercel by design, not by omission.**

`src/lib/repair/db-admin.ts` applies and resets the demo RLS policy by shelling out to the
Supabase CLI (`supabase db query --linked`) on the machine running the app. This is real DDL
execution — not a mock — and works fully when running locally (`npm run dev`) on a machine
where the CLI is installed, authenticated, and linked to the demo Supabase project via
`supabase link`.

It cannot work on Vercel's serverless functions: they don't have the Supabase CLI installed,
don't hold a persistent CLI auth session, and don't have a filesystem-linked project directory
between invocations. Rather than let a click silently fail against a route that's guaranteed
not to work, the deployment capability check (`src/lib/deployment/capabilities.ts`) detects
Vercel via the platform's own `VERCEL` environment variable and reports
`databaseMutation`/`demoReset` as unavailable up front, with a plain-English reason — the UI
never renders the "Approve and apply repair" or "Reset vulnerable demo" buttons on Vercel at
all. Everywhere else (localhost, or any other host), the same check instead runs the real CLI
readiness probe (`checkMutationReadiness()`), so a genuinely broken local CLI setup is still
reported honestly rather than assumed to work just because the host isn't Vercel.

Replacing the CLI mutation mechanism with a serverless-compatible path (e.g. calling
Supabase's management API directly with a scoped service credential) remains intentionally
out of scope — this milestone makes the limitation accurate and self-explanatory, not the
mechanism itself different.
