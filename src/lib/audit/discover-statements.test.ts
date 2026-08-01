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

  it("classifies CREATE FUNCTION and CREATE OR REPLACE FUNCTION", () => {
    const statements = splitSqlStatements(`
create function public.f() returns void language sql as $$ select 1; $$;
create or replace function public.g() returns void language sql as $$ select 2; $$;
`);
    expect(statements.map((s) => s.type)).toEqual(["CREATE_FUNCTION", "CREATE_FUNCTION"]);
  });

  it("classifies CREATE VIEW and CREATE OR REPLACE VIEW", () => {
    const statements = splitSqlStatements(`
create view public.v as select 1;
create or replace view public.w as select 2;
`);
    expect(statements.map((s) => s.type)).toEqual(["CREATE_VIEW", "CREATE_VIEW"]);
  });

  it("does not split a CREATE FUNCTION body on a semicolon inside a $$ dollar-quoted block", () => {
    const statements = splitSqlStatements(`
create function public.f() returns int language plpgsql as $$
begin
  insert into public.log (msg) values ('hi');
  return 1;
end;
$$;
`);
    expect(statements).toHaveLength(1);
    expect(statements[0].type).toBe("CREATE_FUNCTION");
    expect(statements[0].raw).toContain("return 1;");
  });

  it("does not split a dollar-quoted body on a semicolon when using a named tag", () => {
    const statements = splitSqlStatements(`
create function public.f() returns int language plpgsql as $function$
begin
  return 1;
end;
$function$;
`);
    expect(statements).toHaveLength(1);
    expect(statements[0].type).toBe("CREATE_FUNCTION");
  });

  it("does not treat a nested $$ inside a differently-tagged dollar-quoted body as a close", () => {
    const statements = splitSqlStatements(`
create function public.f() returns text language plpgsql as $body$
begin
  return 'literal $$ inside body';
end;
$body$;
create table public.after (id int);
`);
    expect(statements.map((s) => s.type)).toEqual(["CREATE_FUNCTION", "CREATE_TABLE"]);
  });
});
