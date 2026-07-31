import { describe, expect, it } from "vitest";
import { scanRlsPolicies } from "./scan-rls-policies";
import type { ScannedFile } from "./types";

const REPOSITORY = "HW006-J/rls-red-alert-demo-target";

function fixtureFile(path: string, lines: string[]): ScannedFile {
  return { path, content: lines.join("\n") };
}

describe("scanRlsPolicies", () => {
  it("detects USING (true) inside a CREATE POLICY and extracts file/line/table/operation/role", () => {
    const file = fixtureFile("supabase/migrations/0001_init.sql", [
      '-- Safe policy: users can only see their own profile',
      'CREATE POLICY "select_own" ON public.profiles',
      "  FOR SELECT",
      "  TO authenticated",
      "  USING (auth.uid() = user_id);",
      "",
      "-- Unrelated boolean default, not a policy",
      "ALTER TABLE public.settings ADD COLUMN enabled boolean DEFAULT true;",
      "",
      "-- TODO: this comment mentions true but is not SQL",
      "",
      "-- Vulnerable: allows anyone to read every profile",
      'CREATE POLICY "public_read_all" ON public.profiles',
      "  FOR SELECT",
      "  TO public",
      "  USING (true);",
    ]);

    const findings = scanRlsPolicies(REPOSITORY, [file]);

    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding.ruleId).toBe("RLS_ALLOW_ALL");
    expect(finding.severity).toBe("critical");
    expect(finding.repository).toBe(REPOSITORY);
    expect(finding.filePath).toBe("supabase/migrations/0001_init.sql");
    expect(finding.line).toBe(16);
    expect(finding.table).toBe("public.profiles");
    expect(finding.operation).toBe("SELECT");
    expect(finding.role).toBe("public");
    expect(finding.evidence).toContain("USING (true)");
  });

  it("does not flag unrelated occurrences of the word true", () => {
    const file = fixtureFile("supabase/migrations/0002_settings.sql", [
      "ALTER TABLE public.settings ADD COLUMN enabled boolean DEFAULT true;",
      "-- comment saying this is true and fine",
      'CREATE POLICY "own_settings" ON public.settings',
      "  FOR ALL",
      "  TO authenticated",
      "  USING (owner_id = auth.uid());",
      "",
      'CREATE POLICY "admin_flag_check" ON public.settings',
      "  FOR ALL",
      "  TO authenticated",
      "  USING (is_admin = true);",
    ]);

    const findings = scanRlsPolicies(REPOSITORY, [file]);

    expect(findings).toHaveLength(0);
  });

  it("returns no findings for files with no CREATE POLICY statements", () => {
    const file = fixtureFile("supabase/schema.sql", [
      "CREATE TABLE public.profiles (id uuid primary key, user_id uuid not null);",
    ]);

    expect(scanRlsPolicies(REPOSITORY, [file])).toHaveLength(0);
  });

  it("extracts the table from a quoted policy name containing spaces", () => {
    const file = fixtureFile("supabase/migrations/0004_quoted_name.sql", [
      'create policy "Authenticated trainers can view clients"',
      "on public.clients",
      "for select",
      "to authenticated",
      "using (true);",
    ]);

    const findings = scanRlsPolicies(REPOSITORY, [file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].table).toBe("public.clients");
    expect(findings[0].operation).toBe("SELECT");
    expect(findings[0].role).toBe("authenticated");
  });

  it("detects an allow-all policy even with redundant nested parentheses", () => {
    const file = fixtureFile("supabase/migrations/0003_nested.sql", [
      'CREATE POLICY "public_all" ON public.orders',
      "  FOR ALL",
      "  TO public",
      "  USING ((( true )));",
    ]);

    const findings = scanRlsPolicies(REPOSITORY, [file]);
    expect(findings).toHaveLength(1);
    expect(findings[0].table).toBe("public.orders");
  });
});
