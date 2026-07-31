#!/usr/bin/env node
/**
 * One-time provisioning utility for the isolated RLS Red Alert demo Supabase
 * project. This is a developer tool, not part of the deployed application —
 * it is never imported by the Next.js app and never runs at request time.
 *
 * It performs only real, live actions against the configured demo project:
 *   1. Ensures public.clients exists, RLS is enabled, and the deliberately
 *      vulnerable `USING (true)` SELECT policy is installed (idempotent —
 *      mirrors the migrations in the rls-red-alert-demo-target repository).
 *   2. Creates two real Supabase Auth users (Trainer A / Trainer B) if they
 *      don't already exist.
 *   3. Seeds two rows per trainer if that trainer has none yet.
 *   4. Signs in as Trainer A through the real anon client (a genuine
 *      password grant, not a simulated session) and queries public.clients.
 *   5. Reports, honestly, whether Trainer B's rows were returned. If they
 *      were not, the script says so — it never fabricates a pass.
 *
 * Requirements:
 *   - DEMO_SUPABASE_URL, DEMO_SUPABASE_ANON_KEY, DEMO_ATTACKER_EMAIL,
 *     DEMO_ATTACKER_PASSWORD, DEMO_VICTIM_EMAIL, DEMO_VICTIM_PASSWORD set
 *     (e.g. via `node --env-file=.env.local scripts/setup-demo-environment.mjs`).
 *   - The Supabase CLI installed, authenticated, and linked to the demo
 *     project (`supabase link --project-ref <ref>`) — used only to run
 *     schema DDL and seed rows via the Management API, so this script never
 *     needs a raw Postgres password.
 *   - SUPABASE_SERVICE_ROLE_KEY passed on the invoking shell for this run
 *     only (never read from .env.local, never written anywhere, never
 *     logged) — required solely to create the two Auth test users via the
 *     GoTrue Admin API. The deployed application never uses this key.
 */

import { execFileSync } from "node:child_process";

const REQUIRED_ENV = [
  "DEMO_SUPABASE_URL",
  "DEMO_SUPABASE_ANON_KEY",
  "DEMO_ATTACKER_EMAIL",
  "DEMO_ATTACKER_PASSWORD",
  "DEMO_VICTIM_EMAIL",
  "DEMO_VICTIM_PASSWORD",
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function fail(message) {
  console.error(`\n[FAIL] ${message}`);
  process.exitCode = 1;
}

function runManagementSql(sql) {
  const raw = execFileSync("supabase", ["db", "query", "--linked", sql], {
    encoding: "utf-8",
  });
  return JSON.parse(raw);
}

const SCHEMA_SQL = `
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  private_notes text,
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;

drop policy if exists "Authenticated trainers can view clients" on public.clients;

create policy "Authenticated trainers can view clients"
on public.clients
for select
to authenticated
using (true);
`;

async function ensureAuthUser(baseUrl, serviceRoleKey, email, password) {
  const listResp = await fetch(
    `${baseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  const listBody = await listResp.json();
  const existing = Array.isArray(listBody.users)
    ? listBody.users.find((u) => u.email === email)
    : null;
  if (existing) {
    return { id: existing.id, created: false };
  }

  const createResp = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const createBody = await createResp.json();
  if (!createResp.ok || !createBody.id) {
    throw new Error(
      `Failed to create auth user ${email}: ${createBody.msg ?? createBody.message ?? createResp.status}`,
    );
  }
  return { id: createBody.id, created: true };
}

function seedClientRows(trainerId, label) {
  const existing = runManagementSql(
    `select count(*)::int as count from public.clients where trainer_id = '${trainerId}';`,
  );
  const count = existing.rows?.[0]?.count ?? 0;
  if (count > 0) {
    console.log(`  ${label}: already has ${count} row(s), skipping seed.`);
    return;
  }

  runManagementSql(
    `insert into public.clients (trainer_id, name, email, private_notes) values
      ('${trainerId}', 'Demo Client One', 'client-one@example.test', '${label} client note.'),
      ('${trainerId}', 'Demo Client Two', 'client-two@example.test', '${label} client note.');`,
  );
  console.log(`  ${label}: seeded 2 rows.`);
}

async function signInAndFetchClients(baseUrl, anonKey, email, password) {
  const tokenResp = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const tokenBody = await tokenResp.json();
  if (!tokenResp.ok || !tokenBody.access_token) {
    throw new Error(
      `Sign-in failed for ${email}: ${tokenBody.msg ?? tokenBody.error_description ?? tokenResp.status}`,
    );
  }

  const rowsResp = await fetch(
    `${baseUrl}/rest/v1/clients?select=id,trainer_id,name,email,private_notes`,
    {
      headers: { apikey: anonKey, Authorization: `Bearer ${tokenBody.access_token}` },
    },
  );
  if (!rowsResp.ok) {
    throw new Error(`Query failed with status ${rowsResp.status}`);
  }
  return rowsResp.json();
}

async function main() {
  for (const name of REQUIRED_ENV) requireEnv(name);

  const baseUrl = requireEnv("DEMO_SUPABASE_URL");
  const anonKey = requireEnv("DEMO_SUPABASE_ANON_KEY");
  const attackerEmail = requireEnv("DEMO_ATTACKER_EMAIL");
  const attackerPassword = requireEnv("DEMO_ATTACKER_PASSWORD");
  const victimEmail = requireEnv("DEMO_VICTIM_EMAIL");
  const victimPassword = requireEnv("DEMO_VICTIM_PASSWORD");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be set on the invoking shell for this run only " +
        "(never store it in .env.local). It is used solely to create the two Auth test " +
        "users and is not used anywhere in the deployed application.",
    );
  }

  console.log("1. Ensuring schema, RLS, and the vulnerable policy exist...");
  runManagementSql(SCHEMA_SQL);
  console.log("   Done.");

  console.log("2. Ensuring the two Auth test users exist...");
  const attacker = await ensureAuthUser(baseUrl, serviceRoleKey, attackerEmail, attackerPassword);
  const victim = await ensureAuthUser(baseUrl, serviceRoleKey, victimEmail, victimPassword);
  console.log(`   Trainer A (attacker): ${attacker.id} ${attacker.created ? "(created)" : "(already existed)"}`);
  console.log(`   Trainer B (victim):   ${victim.id} ${victim.created ? "(created)" : "(already existed)"}`);

  console.log("3. Ensuring seed rows exist for both trainers...");
  seedClientRows(attacker.id, "Trainer A");
  seedClientRows(victim.id, "Trainer B");

  console.log("4. Signing in as Trainer A and querying public.clients...");
  const rows = await signInAndFetchClients(baseUrl, anonKey, attackerEmail, attackerPassword);
  const ownRows = rows.filter((r) => r.trainer_id === attacker.id);
  const leakedRows = rows.filter((r) => r.trainer_id === victim.id);

  console.log(`   Rows returned: ${rows.length} (own: ${ownRows.length}, belonging to Trainer B: ${leakedRows.length})`);

  if (leakedRows.length > 0) {
    console.log(
      "\n[PROVEN LIVE] Trainer A's authenticated session received " +
        `${leakedRows.length} row(s) belonging to Trainer B. The USING (true) policy is exploitable on the live database.`,
    );
  } else {
    fail(
      "Trainer A did not receive any of Trainer B's rows. The live vulnerability was NOT reproduced — " +
        "do not report this as proven. Check that the policy was applied and seed data exists.",
    );
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
