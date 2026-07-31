import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "./discover-statements";
import { parseViewStatement } from "./parse-view";

function parseFirst(sql: string) {
  const [statement] = splitSqlStatements(sql);
  return parseViewStatement(statement, sql, "supabase/migrations/0001.sql");
}

describe("parseViewStatement", () => {
  it("extracts the view name", () => {
    const parsed = parseFirst("create view public.client_summary as select id from public.clients;");
    expect(parsed.name).toBe("public.client_summary");
  });

  it("detects security_invoker = true", () => {
    const parsed = parseFirst(
      "create view public.v with (security_invoker = true) as select id from public.clients;",
    );
    expect(parsed.securityInvoker).toBe(true);
  });

  it("does not detect security_invoker when absent", () => {
    const parsed = parseFirst("create view public.v as select id from public.clients;");
    expect(parsed.securityInvoker).toBe(false);
  });

  it("extracts referenced tables from FROM and JOIN clauses", () => {
    const parsed = parseFirst(
      "create view public.v as select c.id, t.name from public.clients c join public.trainers t on t.id = c.trainer_id;",
    );
    expect(parsed.referencedTables).toContain("public.clients");
    expect(parsed.referencedTables).toContain("public.trainers");
  });

  it("deduplicates repeated table references", () => {
    const parsed = parseFirst(
      "create view public.v as select * from public.clients where id in (select id from public.clients where active);",
    );
    expect(parsed.referencedTables.filter((t) => t === "public.clients")).toHaveLength(1);
  });
});
