import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "./discover-statements";
import { parsePolicyStatement } from "./parse-policy";

function parseFirstPolicy(content: string) {
  const [statement] = splitSqlStatements(content).filter((s) => s.type === "CREATE_POLICY");
  return parsePolicyStatement(statement, content, "supabase/migrations/0001.sql");
}

describe("parsePolicyStatement", () => {
  it("extracts name, table, operation, roles, and the USING expression", () => {
    const policy = parseFirstPolicy(
      'create policy "select_own" on public.profiles for select to authenticated using (auth.uid() = user_id);',
    );

    expect(policy.name).toBe("select_own");
    expect(policy.table).toBe("public.profiles");
    expect(policy.operation).toBe("SELECT");
    expect(policy.roles).toEqual(["authenticated"]);
    expect(policy.usingExpression).toBe("auth.uid() = user_id");
    expect(policy.withCheckExpression).toBeNull();
  });

  it("extracts the WITH CHECK expression separately from USING", () => {
    const policy = parseFirstPolicy(
      'create policy "p" on public.t for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());',
    );

    expect(policy.usingExpression).toBe("owner_id = auth.uid()");
    expect(policy.withCheckExpression).toBe("owner_id = auth.uid()");
  });

  it("extracts multiple comma-separated roles", () => {
    const policy = parseFirstPolicy(
      'create policy "p" on public.t for select to authenticated, service_role using (true);',
    );
    expect(policy.roles).toEqual(["authenticated", "service_role"]);
  });

  it("still extracts table/operation/role/expression when the policy is preceded by a comment with no semicolon between them", () => {
    // This is the normal style real migrations use, and previously broke name
    // extraction because the anchored regex expected "create policy" at the
    // very start of the statement text (which then included the comment).
    const policy = parseFirstPolicy(`-- Vulnerable: allows anyone to read every profile
create policy "public_read_all" on public.profiles
  for select
  to public
  using (true);`);

    expect(policy.name).toBe("public_read_all");
    expect(policy.table).toBe("public.profiles");
    expect(policy.operation).toBe("SELECT");
    expect(policy.roles).toEqual(["public"]);
    expect(policy.usingExpression).toBe("true");
  });

  it("extracts a quoted policy name containing spaces", () => {
    const policy = parseFirstPolicy(
      'create policy "Authenticated trainers can view clients" on public.clients for select to authenticated using (true);',
    );
    expect(policy.name).toBe("Authenticated trainers can view clients");
    expect(policy.table).toBe("public.clients");
  });

  it("computes the line number of the USING clause, not just the statement start", () => {
    const content = [
      'create policy "p" on public.t',
      "  for select",
      "  to authenticated",
      "  using (true);",
    ].join("\n");
    const policy = parseFirstPolicy(content);
    expect(policy.usingLine).toBe(4);
    expect(policy.line).toBe(1);
  });
});
