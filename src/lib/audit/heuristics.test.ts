import { describe, expect, it } from "vitest";
import { looksLikeTenantScopingPattern } from "./heuristics";

describe("looksLikeTenantScopingPattern", () => {
  it("matches a simple auth.uid() equality check", () => {
    expect(looksLikeTenantScopingPattern("auth.uid() = owner_id")).toBe(true);
  });

  it("matches auth.jwt() usage", () => {
    expect(looksLikeTenantScopingPattern("(auth.jwt() ->> 'org_id') = org_id")).toBe(true);
  });

  it("does not match a bare literal true", () => {
    expect(looksLikeTenantScopingPattern("true")).toBe(false);
  });

  it("does not match an expression with no identity reference", () => {
    expect(looksLikeTenantScopingPattern("status = 'active'")).toBe(false);
  });

  it("does not match a bare identity function call with no comparison", () => {
    expect(looksLikeTenantScopingPattern("auth.uid()")).toBe(false);
  });
});
