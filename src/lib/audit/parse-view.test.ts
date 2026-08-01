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

/**
 * Reproduces a real miss on the demo-target repository: the view in
 * 006_add_client_directory_view.sql is preceded by two comment lines, and
 * the anchored name regex never matched, so every report said "A view may
 * bypass Row Level Security" instead of naming it. A finding that cannot
 * name the object it is about is much harder to act on.
 */
describe("parseViewStatement — the view's name survives leading comments", () => {
  function parse(raw: string) {
    return parseViewStatement({ raw, startIndex: 0 } as never, raw, "supabase/migrations/006.sql");
  }

  it("names a view preceded by line comments", () => {
    const view = parse(`-- flat list for the client picker / autocomplete
-- reads from clients so it picks up the RLS on that table
create view public.client_directory as
select id, name, email from public.clients;`);

    expect(view.name).toBe("public.client_directory");
  });

  it("names a view preceded by a block comment", () => {
    const view = parse(`/* directory used by the picker */
create view public.client_directory as select id from public.clients;`);

    expect(view.name).toBe("public.client_directory");
  });

  it("names a view preceded by blank lines and indentation", () => {
    const view = parse(`

  create or replace view public.client_directory as select id from public.clients;`);

    expect(view.name).toBe("public.client_directory");
  });

  it("still finds the referenced table when comments precede the statement", () => {
    const view = parse(`-- note
create view public.client_directory as select id from public.clients;`);

    expect(view.referencedTables).toContain("public.clients");
  });

  it("does not invent a name for a statement that is not a create view", () => {
    expect(parse("-- a comment\nselect 1;").name).toBeNull();
  });

  it("is not fooled by the word 'view' inside a comment", () => {
    const view = parse(`-- create view public.decoy as select 1
create view public.client_directory as select id from public.clients;`);

    expect(view.name).toBe("public.client_directory");
  });
});
