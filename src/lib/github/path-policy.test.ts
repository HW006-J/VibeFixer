import { describe, expect, it } from "vitest";
import { isPermittedPath } from "./path-policy";

/**
 * These tests are the acceptance criteria for widening the scanner beyond
 * SQL. Static scanning runs against ANY public GitHub repository, so a path
 * policy that admits a real .env would make this tool fetch strangers'
 * live credentials. Every case below is a safety boundary, not a
 * convenience.
 */
describe("isPermittedPath — environment file denylist", () => {
  it("rejects a real .env file", () => {
    expect(isPermittedPath(".env")).toBe(false);
  });

  it("rejects .env.local", () => {
    expect(isPermittedPath(".env.local")).toBe(false);
  });

  it("rejects .env.production", () => {
    expect(isPermittedPath(".env.production")).toBe(false);
  });

  it("rejects .env.production.local", () => {
    expect(isPermittedPath(".env.production.local")).toBe(false);
  });

  it("rejects a .env nested in a subdirectory", () => {
    expect(isPermittedPath("apps/web/.env")).toBe(false);
  });

  it("rejects .env.example nested in a subdirectory", () => {
    // Only the repository root's example env is in scope. A nested one is
    // not worth the extra surface area.
    expect(isPermittedPath("packages/api/.env.example")).toBe(false);
  });

  it("permits the repository root .env.example", () => {
    expect(isPermittedPath(".env.example")).toBe(true);
  });

  it("permits .env.sample and .env.template at the root", () => {
    expect(isPermittedPath(".env.sample")).toBe(true);
    expect(isPermittedPath(".env.template")).toBe(true);
  });
});

describe("isPermittedPath — SQL paths keep working", () => {
  it("permits a Supabase migration", () => {
    expect(isPermittedPath("supabase/migrations/003_add_session_notes.sql")).toBe(true);
  });

  it("permits the Supabase schema dump", () => {
    expect(isPermittedPath("supabase/schema.sql")).toBe(true);
  });

  it("rejects SQL outside the Supabase directory", () => {
    expect(isPermittedPath("src/queries/report.sql")).toBe(false);
  });

  it("rejects a migration nested deeper than one level", () => {
    expect(isPermittedPath("supabase/migrations/archive/001_old.sql")).toBe(false);
  });
});

describe("isPermittedPath — newly permitted families", () => {
  it("permits firebase.rules at the root", () => {
    expect(isPermittedPath("firebase.rules")).toBe(true);
  });

  it("permits package.json at the root", () => {
    expect(isPermittedPath("package.json")).toBe(true);
  });

  it("permits source files under src/", () => {
    expect(isPermittedPath("src/lib/supabaseClient.ts")).toBe(true);
    expect(isPermittedPath("src/components/Signup.tsx")).toBe(true);
    expect(isPermittedPath("src/legacy/client.js")).toBe(true);
  });
});

describe("isPermittedPath — directory containment", () => {
  it("rejects anything under node_modules, even a permitted filename", () => {
    expect(isPermittedPath("node_modules/left-pad/package.json")).toBe(false);
    expect(isPermittedPath("node_modules/pkg/src/index.ts")).toBe(false);
  });

  it("rejects build output directories", () => {
    expect(isPermittedPath("dist/index.js")).toBe(false);
    expect(isPermittedPath("build/main.js")).toBe(false);
    expect(isPermittedPath(".next/server/page.js")).toBe(false);
  });

  it("rejects anything under .git", () => {
    expect(isPermittedPath(".git/config")).toBe(false);
  });

  it("rejects a nested package.json outside the root", () => {
    expect(isPermittedPath("packages/api/package.json")).toBe(false);
  });

  it("rejects unrelated repository files", () => {
    expect(isPermittedPath("README.md")).toBe(false);
    expect(isPermittedPath("src/assets/logo.png")).toBe(false);
    expect(isPermittedPath("id_rsa")).toBe(false);
  });
});
