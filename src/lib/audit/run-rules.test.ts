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
        "-- Deliberately simplified schema for an authorised security demonstration.",
        "-- Do not deploy this fixture to a real production application.",
        "",
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
    // The real demo table's owner column (trainer_id, via its `references
    // auth.users(id)` foreign key) must be used in the recommendation —
    // never the generic placeholder — since it was confidently parsed from
    // this table's own schema.
    expect(finding.remediation).toContain("auth.uid() = trainer_id");
    expect(finding.remediation).not.toContain("owner_id");
  });

  describe("owner-column-aware remediation", () => {
    it("uses the real schema-parsed owner column in the allow-all remediation when confidently found", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "create table public.orders (",
          "  id uuid primary key default gen_random_uuid(),",
          "  customer_id uuid not null references auth.users(id)",
          ");",
          "alter table public.orders enable row level security;",
          'create policy "p" on public.orders for select to authenticated using (true);',
        ]),
      ]);

      const finding = findings.find((f) => f.ruleId === "RLS_ALLOW_ALL");
      expect(finding?.remediation).toContain("auth.uid() = customer_id");
    });

    it("falls back to the generic owner_id placeholder without inventing a column when no confident owner column is found", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "create table public.notes (id uuid primary key, body text);",
          "alter table public.notes enable row level security;",
          'create policy "p" on public.notes for select to authenticated using (true);',
        ]),
      ]);

      const finding = findings.find((f) => f.ruleId === "RLS_ALLOW_ALL");
      expect(finding?.remediation).toContain("auth.uid() = owner_id");
    });

    it("uses the real schema-parsed owner column in the login-only remediation too", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "create table public.orders (",
          "  id uuid primary key default gen_random_uuid(),",
          "  customer_id uuid not null references auth.users(id)",
          ");",
          "alter table public.orders enable row level security;",
          'create policy "p" on public.orders for select to authenticated using (auth.uid() is not null);',
        ]),
      ]);

      const finding = findings.find((f) => f.ruleId === "VIBE_LOGIN_ONLY_POLICY");
      expect(finding?.remediation).toContain("auth.uid() = customer_id");
    });
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

  describe("VIBE_PUBLIC_TABLE_RLS_DISABLED", () => {
    it("flags a public-schema table created with RLS disabled and no policies at all", () => {
      const { findings } = audit([file("supabase/migrations/0001.sql", ["create table public.secrets (id uuid primary key);"])]);

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe("VIBE_PUBLIC_TABLE_RLS_DISABLED");
      expect(findings[0].tier).toBe("critical");
      expect(findings[0].table).toBe("public.secrets");
    });

    it("flags an unqualified table name the same way (implicit public search_path)", () => {
      const { findings } = audit([file("supabase/migrations/0001.sql", ["create table secrets (id uuid primary key);"])]);

      expect(findings.filter((f) => f.ruleId === "VIBE_PUBLIC_TABLE_RLS_DISABLED")).toHaveLength(1);
    });

    it("does not flag a table in a non-public schema with no evidence it is exposed", () => {
      const { findings } = audit([file("supabase/migrations/0001.sql", ["create table private.secrets (id uuid primary key);"])]);

      expect(findings.filter((f) => f.ruleId === "VIBE_PUBLIC_TABLE_RLS_DISABLED")).toHaveLength(0);
    });

    it("does not flag a table with RLS enabled and zero policies (the safe deny-all default)", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "create table public.secrets (id uuid primary key);",
          "alter table public.secrets enable row level security;",
        ]),
      ]);

      expect(findings.filter((f) => f.ruleId === "VIBE_PUBLIC_TABLE_RLS_DISABLED")).toHaveLength(0);
    });

    it("does not duplicate RLS_DISABLED_WITH_POLICIES when the table has policies", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "create table public.secrets (id uuid primary key);",
          'create policy "p" on public.secrets for select to authenticated using (auth.uid() = id);',
        ]),
      ]);

      expect(findings.filter((f) => f.ruleId === "VIBE_PUBLIC_TABLE_RLS_DISABLED")).toHaveLength(0);
      expect(findings.filter((f) => f.ruleId === "RLS_DISABLED_WITH_POLICIES")).toHaveLength(1);
    });

    it("uses needs_review when the table's CREATE TABLE was not found in the scanned migrations", () => {
      const { findings } = audit([file("supabase/migrations/0001.sql", ["alter table public.secrets disable row level security;"])]);

      const finding = findings.find((f) => f.ruleId === "VIBE_PUBLIC_TABLE_RLS_DISABLED");
      expect(finding).toBeDefined();
      expect(finding?.tier).toBe("review");
    });
  });

  describe("VIBE_ANON_ALLOW_ALL", () => {
    it("flags an allow-all policy targeting anon as the more specific anon rule, not the generic one", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          'create policy "p" on public.t for select to anon using (true);',
        ]),
      ]);

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe("VIBE_ANON_ALLOW_ALL");
      expect(findings[0].tier).toBe("critical");
    });

    it("flags an allow-all policy with an omitted TO clause (defaults to PUBLIC)", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          'create policy "p" on public.t for select using (true);',
        ]),
      ]);

      expect(findings.filter((f) => f.ruleId === "VIBE_ANON_ALLOW_ALL")).toHaveLength(1);
    });

    it("still uses the generic RLS_ALLOW_ALL for an authenticated-only allow-all policy", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          'create policy "p" on public.t for select to authenticated using (true);',
        ]),
      ]);

      expect(findings.filter((f) => f.ruleId === "RLS_ALLOW_ALL")).toHaveLength(1);
      expect(findings.filter((f) => f.ruleId === "VIBE_ANON_ALLOW_ALL")).toHaveLength(0);
    });

    it("flags an anon allow-all WITH CHECK on an INSERT policy", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          'create policy "p" on public.t for insert to anon with check (true);',
        ]),
      ]);

      expect(findings.filter((f) => f.ruleId === "VIBE_ANON_ALLOW_ALL")).toHaveLength(1);
    });
  });

  describe("VIBE_LOGIN_ONLY_POLICY", () => {
    it("flags auth.uid() is not null as the entire policy", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          'create policy "p" on public.t for select to authenticated using (auth.uid() is not null);',
        ]),
      ]);

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe("VIBE_LOGIN_ONLY_POLICY");
      expect(findings[0].tier).toBe("high");
    });

    it("does not flag it when combined with a real ownership boundary", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          'create policy "p" on public.t for select to authenticated using (auth.uid() is not null and auth.uid() = owner_id);',
        ]),
      ]);

      expect(findings.filter((f) => f.ruleId === "VIBE_LOGIN_ONLY_POLICY")).toHaveLength(0);
    });
  });

  describe("VIBE_NON_NULL_OWNER_POLICY", () => {
    it("flags a bare owner-column not-null check", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          'create policy "p" on public.t for select to authenticated using (trainer_id is not null);',
        ]),
      ]);

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe("VIBE_NON_NULL_OWNER_POLICY");
      expect(findings[0].tier).toBe("high");
    });

    it("does not flag a genuine ownership comparison", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          'create policy "p" on public.t for select to authenticated using (trainer_id = auth.uid());',
        ]),
      ]);

      expect(findings.filter((f) => f.ruleId === "VIBE_NON_NULL_OWNER_POLICY")).toHaveLength(0);
    });
  });

  describe("VIBE_USER_METADATA_AUTHORIZATION", () => {
    it("flags a direct user-metadata authorization check as high tier", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          "create policy \"p\" on public.t for select to authenticated using ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean);",
        ]),
      ]);

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe("VIBE_USER_METADATA_AUTHORIZATION");
      expect(findings[0].tier).toBe("high");
      expect(findings[0].confidence).toBe("high");
    });

    it("downgrades to needs_review when combined with other logic", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          "create policy \"p\" on public.t for select to authenticated using (auth.uid() = owner_id and (raw_user_meta_data ->> 'role') = 'admin');",
        ]),
      ]);

      expect(findings.filter((f) => f.ruleId === "VIBE_USER_METADATA_AUTHORIZATION")).toHaveLength(1);
      expect(findings.find((f) => f.ruleId === "VIBE_USER_METADATA_AUTHORIZATION")?.tier).toBe("review");
    });

    it("does not flag trusted app_metadata usage", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          "create policy \"p\" on public.t for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');",
        ]),
      ]);

      expect(findings.filter((f) => f.ruleId === "VIBE_USER_METADATA_AUTHORIZATION")).toHaveLength(0);
    });
  });

  describe("VIBE_PERMISSIVE_POLICY_BROADENING", () => {
    it("flags a narrow ownership policy undermined by a broader allow-all policy on the same table/operation/role", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          'create policy "owner_only" on public.t for select to authenticated using (auth.uid() = owner_id);',
          'create policy "everyone" on public.t for select to authenticated using (true);',
        ]),
      ]);

      const broadening = findings.find((f) => f.ruleId === "VIBE_PERMISSIVE_POLICY_BROADENING");
      expect(broadening).toBeDefined();
      expect(broadening?.tier).toBe("high");
      expect(broadening?.table).toBe("public.t");
    });

    it("does not flag two narrow ownership policies that do not broaden each other", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          'create policy "owner_only" on public.t for select to authenticated using (auth.uid() = owner_id);',
          'create policy "admin_only" on public.t for select to authenticated using (auth.uid() = admin_id);',
        ]),
      ]);

      expect(findings.filter((f) => f.ruleId === "VIBE_PERMISSIVE_POLICY_BROADENING")).toHaveLength(0);
    });

    it("does not flag policies for non-overlapping operations", () => {
      const { findings } = audit([
        file("supabase/migrations/0001.sql", [
          "alter table public.t enable row level security;",
          'create policy "owner_select" on public.t for select to authenticated using (auth.uid() = owner_id);',
          'create policy "public_delete" on public.t for delete to authenticated using (true);',
        ]),
      ]);

      expect(findings.filter((f) => f.ruleId === "VIBE_PERMISSIVE_POLICY_BROADENING")).toHaveLength(0);
    });
  });
});
