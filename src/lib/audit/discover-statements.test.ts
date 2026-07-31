import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "./discover-statements";

describe("splitSqlStatements", () => {
  it("splits and classifies CREATE TABLE, ALTER TABLE RLS, and CREATE POLICY statements", () => {
    const sql = `
create table public.clients (id uuid primary key);

alter table public.clients enable row level security;

create policy "p" on public.clients for select to authenticated using (true);
`;
    const statements = splitSqlStatements(sql);
    expect(statements.map((s) => s.type)).toEqual([
      "CREATE_TABLE",
      "ALTER_TABLE_ENABLE_RLS",
      "CREATE_POLICY",
    ]);
  });

  it("classifies ALTER TABLE ... DISABLE ROW LEVEL SECURITY", () => {
    const statements = splitSqlStatements("alter table public.t disable row level security;");
    expect(statements[0].type).toBe("ALTER_TABLE_DISABLE_RLS");
  });

  it("classifies DROP POLICY and ALTER POLICY", () => {
    const statements = splitSqlStatements(`
drop policy if exists "p" on public.t;
alter policy "p" on public.t to authenticated;
`);
    expect(statements.map((s) => s.type)).toEqual(["DROP_POLICY", "ALTER_POLICY"]);
  });

  it("does not split on a semicolon inside a single-quoted string literal", () => {
    const statements = splitSqlStatements(
      "create policy \"p\" on public.t for select using (name = 'a;b');",
    );
    expect(statements).toHaveLength(1);
    expect(statements[0].raw).toContain("'a;b'");
  });

  it("ignores semicolons and keywords inside line comments", () => {
    const statements = splitSqlStatements(`
-- create table fake (id int); this is just a comment
create table public.real_table (id uuid primary key);
`);
    expect(statements).toHaveLength(1);
    expect(statements[0].type).toBe("CREATE_TABLE");
  });

  it("ignores content inside block comments", () => {
    const statements = splitSqlStatements(`
/* create policy "fake" on t using (true); */
create table public.real_table (id uuid primary key);
`);
    expect(statements).toHaveLength(1);
    expect(statements[0].type).toBe("CREATE_TABLE");
  });

  it("classifies unrelated statements as OTHER", () => {
    const statements = splitSqlStatements("insert into public.t (a) values (1);");
    expect(statements[0].type).toBe("OTHER");
  });

  it("reports the correct start index for each statement", () => {
    const sql = "create table a (id int);\ncreate table b (id int);";
    const statements = splitSqlStatements(sql);
    expect(sql.slice(statements[1].startIndex, statements[1].startIndex + 12)).toBe("create table");
  });
});
