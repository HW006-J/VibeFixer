import { describe, expect, it } from "vitest";
import { redactSecretValue } from "./redact";
import { runSecretChecks } from "./run-secret-checks";

describe("secret checks", () => {
  it("flags synthetic hardcoded API key assignment", () => {
    const content = `const config = { apiKey: "vfx_test_AbCdEfGhIjKlMnOpQrStUvWx" };`;
    const findings = runSecretChecks([{ path: "src/lib/config.ts", content }]);
    expect(findings.some((f) => f.ruleId === "SECRET_HARDCODED_API_KEY")).toBe(true);
  });

  it("does not flag placeholder values", () => {
    const content = `const config = { apiKey: "your-api-key-here" };`;
    const findings = runSecretChecks([{ path: "src/lib/config.ts", content }]);
    expect(findings.filter((f) => f.ruleId === "SECRET_HARDCODED_API_KEY")).toHaveLength(0);
  });

  it("flags NEXT_PUBLIC secret-like variables", () => {
    const content = `NEXT_PUBLIC_DEMO_TOKEN="vfxpub_AbCdEfGhIjKlMnOpQrStUvWxYz"`;
    const findings = runSecretChecks([{ path: "src/config/env.ts", content }]);
    expect(findings.some((f) => f.ruleId === "SECRET_NEXT_PUBLIC")).toBe(true);
  });

  it("redacts evidence without exposing full secret", () => {
    const redacted = redactSecretValue("vfx_test_AbCdEfGhIjKlMnOpQrStUvWx");
    expect(redacted).not.toContain("AbCdEfGhIjKlMnOpQrStUvWx");
    expect(redacted).toMatch(/…/);
  });

  it("detects private key blocks", () => {
    const content = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----";
    const findings = runSecretChecks([{ path: "src/keys/bad.pem", content }]);
    expect(findings.some((f) => f.ruleId === "SECRET_PRIVATE_KEY")).toBe(true);
  });
});
