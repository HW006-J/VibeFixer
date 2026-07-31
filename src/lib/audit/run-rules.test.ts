import { describe, expect, it } from "vitest";
import { buildSchemaInventory } from "./build-inventory";
import { runDeterministicRules } from "./run-rules";
import type { ScannedFile } from "../scanner/types";

const REPOSITORY = "HW006-J/rls-red-alert-demo-target";

function file(path: string, lines: string[]): ScannedFile {
  return { path, content: lines.join("\n") };
}

function audit(files: ScannedFile[]) {
  const inventory = buildSchemaInventory(files);
  return runDeterministicRules(inventory, REPOSITORY);
}

describe("runDeterministicRules", () => {
  it("regression: still detects the real demo fixture's USING (true) policy exactly as before", () => {
    const { findings } = audit([
      file("supabase/migrations/001_create_clients.sql", [
        "create table public.clients (",
        "  id uuid primary key default gen_random_uuid(),",
        "  trainer_id uuid not null references auth.users(id) on delete cascade",
        ");",
        "",
        "alter table public.clients enable row level security;",
      ]),
      file("supabase/migrations/002_add_vulnerable_clients_policy.sql", [
        "-- INTENTIONALLY VULNERABLE.",
        "-- This policy exists solely for the RLS Red Alert authorised demo.",
        "",
        'create policy "Authenticated trainers can view clients"',
        "on public.clients",
        "for select",
        "to authenticated",
        "using (true);",
      ]),
    ]);

    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding.ruleId).toBe("RLS_ALLOW_ALL");
    expect(finding.tier).toBe("critical");
    expect(finding.table).toBe("public.clients");
    expect(finding.operation).toBe("SELECT");
    expect(finding.role).toBe("authenticated");
    expect(finding.line).toBe(8);
    expect(finding.filePath).toBe("supabase/migrations/002_add_vulnerable_clients_policy.sql");
  });

  it("flags WITH CHECK (true) on an INSERT policy as critical", () => {
    const { findings } = audit([
      file("supabase/migrations/0001.sql", [
        "alter table public.t enable row level security;",
        'create policy "p" on public.t for insert to authenticated with check (true);',
      ]),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("RLS_WITH_CHECK_ALLOW_ALL");
    expect(findings[0].tier).toBe("critical");
  });

  it("flags a table with policies defined but RLS never enabled", () => {
    const { findings } = audit([
      file("supabase/migrations/0001.sql", [
        "create table public.t (id uuid primary key);",
        'create policy "p" on public.t for select to authenticated using (auth.uid() = owner_id);',
      ]),
    ]);

    const disabled = findings.find((f) => f.ruleId === "RLS_DISABLED_WITH_POLICIES");
    expect(disabled).toBeDefined();
    expect(disabled?.tier).toBe("critical");
    expect(disabled?.table).toBe("public.t");
  });

  it("does not flag a table with RLS enabled and a recognised tenant-scoping policy", () => {
    const { findings, noIssueFoundCount } = audit([
      file("supabase/migrations/0001.sql", [
        "alter table public.t enable row level security;",
        'create policy "p" on public.t for select to authenticated using (auth.uid() = owner_id);',
      ]),
    ]);

    expect(findings).toHaveLength(0);
    expect(noIssueFoundCount).toBe(1);
  });

  it("classifies a policy with an unrecognised expression as needing review, not critical", () => {
    const { findings } = audit([
      file("supabase/migrations/0001.sql", [
        "alter table public.t enable row level security;",
        'create policy "p" on public.t for select to authenticated using (status = \'active\');',
      ]),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("RLS_POLICY_NEEDS_REVIEW");
    expect(findings[0].tier).toBe("review");
    expect(findings[0].expression).toBe("status = 'active'");
    expect(findings[0].clause).toBe("USING");
    expect(findings[0].aiReview).toBeNull();
  });

  it("does not flag WITH CHECK (true) on a SELECT-only policy as an allow-all write", () => {
    // USING(true) on SELECT is still critical via RLS_ALLOW_ALL, but a
    // WITH CHECK on a read-only operation is not a write-scope allow-all.
    const { findings } = audit([
      file("supabase/migrations/0001.sql", [
        "alter table public.t enable row level security;",
        'create policy "p" on public.t for select to authenticated using (true);',
      ]),
    ]);

    expect(findings.filter((f) => f.ruleId === "RLS_WITH_CHECK_ALLOW_ALL")).toHaveLength(0);
    expect(findings.filter((f) => f.ruleId === "RLS_ALLOW_ALL")).toHaveLength(1);
  });
});
