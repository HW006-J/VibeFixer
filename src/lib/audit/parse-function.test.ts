import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "./discover-statements";
import { parseFunctionStatement } from "./parse-function";

function parseFirst(sql: string) {
  const [statement] = splitSqlStatements(sql);
  return parseFunctionStatement(statement, sql, "supabase/migrations/0001.sql");
}

describe("parseFunctionStatement", () => {
  it("extracts the function name", () => {
    const parsed = parseFirst("create function public.get_balance() returns int language sql as $$ select 1; $$;");
    expect(parsed.name).toBe("public.get_balance");
  });

  it("detects SECURITY DEFINER", () => {
    const parsed = parseFirst(
      "create function public.f() returns int language sql security definer as $$ select 1; $$;",
    );
    expect(parsed.securityDefiner).toBe(true);
  });

  it("does not detect SECURITY DEFINER when absent (SECURITY INVOKER is the Postgres default)", () => {
    const parsed = parseFirst("create function public.f() returns int language sql as $$ select 1; $$;");
    expect(parsed.securityDefiner).toBe(false);
  });

  it("recognises an explicit, safe search_path", () => {
    const parsed = parseFirst(
      "create function public.f() returns int language sql security definer set search_path = '' as $$ select 1; $$;",
    );
    expect(parsed.hasAnyExplicitSearchPath).toBe(true);
    expect(parsed.hasSafeExplicitSearchPath).toBe(true);
  });

  it("treats a search_path that includes public as not safe", () => {
    const parsed = parseFirst(
      "create function public.f() returns int language sql security definer set search_path = public, pg_temp as $$ select 1; $$;",
    );
    expect(parsed.hasAnyExplicitSearchPath).toBe(true);
    expect(parsed.hasSafeExplicitSearchPath).toBe(false);
  });

  it("reports no explicit search_path when none is set", () => {
    const parsed = parseFirst("create function public.f() returns int language sql security definer as $$ select 1; $$;");
    expect(parsed.hasAnyExplicitSearchPath).toBe(false);
    expect(parsed.hasSafeExplicitSearchPath).toBe(false);
  });
});
