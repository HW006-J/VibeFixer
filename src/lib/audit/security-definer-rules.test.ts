import { describe, expect, it } from "vitest";
import type { TableInventoryEntry } from "./build-inventory";
import type { ParsedFunction } from "./parse-function";
import type { ParsedView } from "./parse-view";
import { evaluateSecurityDefinerFunctions, evaluateSecurityDefinerViews } from "./security-definer-rules";

const REPOSITORY = "some-owner/some-repo";

function fn(overrides: Partial<ParsedFunction> = {}): ParsedFunction {
  return {
    name: "public.f",
    securityDefiner: true,
    hasAnyExplicitSearchPath: false,
    hasSafeExplicitSearchPath: false,
    filePath: "supabase/migrations/0001.sql",
    line: 1,
    endLine: 3,
    evidence: "create function public.f() ... security definer as $$ ... $$;",
    ...overrides,
  };
}

function view(overrides: Partial<ParsedView> = {}): ParsedView {
  return {
    name: "public.v",
    securityInvoker: false,
    referencedTables: ["public.clients"],
    filePath: "supabase/migrations/0001.sql",
    line: 1,
    endLine: 1,
    evidence: "create view public.v as select id from public.clients;",
    ...overrides,
  };
}

function protectedTable(): Map<string, TableInventoryEntry> {
  const tables = new Map<string, TableInventoryEntry>();
  tables.set("public.clients", {
    table: "public.clients",
    rlsEnabled: true,
    createdAt: { filePath: "supabase/migrations/0000.sql", line: 1 },
    rlsChanges: [],
    policies: [],
    ownerColumnHint: null,
  });
  return tables;
}

describe("evaluateSecurityDefinerFunctions", () => {
  it("flags a SECURITY DEFINER function with no search_path at all as high confidence", () => {
    const findings = evaluateSecurityDefinerFunctions([fn()], REPOSITORY);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("VIBE_SECURITY_DEFINER_SEARCH_PATH");
    expect(findings[0].tier).toBe("high");
    expect(findings[0].objectType).toBe("function");
  });

  it("flags a SECURITY DEFINER function whose search_path includes a mutable schema", () => {
    const findings = evaluateSecurityDefinerFunctions(
      [fn({ hasAnyExplicitSearchPath: true, hasSafeExplicitSearchPath: false })],
      REPOSITORY,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].tier).toBe("high");
  });

  it("does not flag a SECURITY DEFINER function with a safe explicit search_path", () => {
    const findings = evaluateSecurityDefinerFunctions(
      [fn({ hasAnyExplicitSearchPath: true, hasSafeExplicitSearchPath: true })],
      REPOSITORY,
    );
    expect(findings).toHaveLength(0);
  });

  it("does not flag a function that is not SECURITY DEFINER", () => {
    const findings = evaluateSecurityDefinerFunctions([fn({ securityDefiner: false })], REPOSITORY);
    expect(findings).toHaveLength(0);
  });

  it("uses needs_review when the function name could not be parsed", () => {
    const findings = evaluateSecurityDefinerFunctions([fn({ name: null })], REPOSITORY);
    expect(findings).toHaveLength(1);
    expect(findings[0].tier).toBe("review");
  });
});

describe("evaluateSecurityDefinerViews", () => {
  it("flags a view without security_invoker that references an RLS-enabled table as high confidence", () => {
    const findings = evaluateSecurityDefinerViews([view()], protectedTable(), REPOSITORY);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("VIBE_SECURITY_DEFINER_VIEW");
    expect(findings[0].tier).toBe("high");
    expect(findings[0].objectType).toBe("view");
  });

  it("does not flag a view that explicitly opts into security_invoker", () => {
    const findings = evaluateSecurityDefinerViews([view({ securityInvoker: true })], protectedTable(), REPOSITORY);
    expect(findings).toHaveLength(0);
  });

  it("uses needs_review when the view does not reference any known RLS-enabled table", () => {
    const emptyTables = new Map<string, TableInventoryEntry>();
    const findings = evaluateSecurityDefinerViews([view()], emptyTables, REPOSITORY);
    expect(findings).toHaveLength(1);
    expect(findings[0].tier).toBe("review");
  });

  it("does not call every view exploitable — a view over a non-RLS table is only needs_review", () => {
    const tables = new Map<string, TableInventoryEntry>();
    tables.set("public.public_notices", {
      table: "public.public_notices",
      rlsEnabled: false,
      createdAt: { filePath: "supabase/migrations/0000.sql", line: 1 },
      rlsChanges: [],
      policies: [],
      ownerColumnHint: null,
    });
    const findings = evaluateSecurityDefinerViews(
      [view({ referencedTables: ["public.public_notices"] })],
      tables,
      REPOSITORY,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].tier).toBe("review");
  });
});
