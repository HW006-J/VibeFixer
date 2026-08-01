import { describe, expect, it } from "vitest";
import { scanPathRules } from "./fetch-scan-files";

describe("fetch scan path rules", () => {
  it("never permits .env files", () => {
    expect(scanPathRules.isEnvFile(".env")).toBe(true);
    expect(scanPathRules.isEnvFile(".env.local")).toBe(true);
    expect(scanPathRules.isPermittedScanPath(".env")).toBe(false);
  });

  it("permits supabase migrations and api routes", () => {
    expect(scanPathRules.isPermittedScanPath("supabase/migrations/001.sql")).toBe(true);
    expect(scanPathRules.isPermittedScanPath("src/app/api/admin/route.ts")).toBe(true);
  });

  it("permits IAM-looking JSON paths", () => {
    expect(scanPathRules.isPermittedScanPath("infra/iam/trust-policy.json")).toBe(true);
  });
});
