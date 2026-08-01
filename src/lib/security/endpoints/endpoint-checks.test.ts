import { describe, expect, it } from "vitest";
import { endpointTestHelpers } from "./run-endpoint-checks";
import { runEndpointChecks } from "./run-endpoint-checks";

const { hasAuthMechanism } = endpointTestHelpers;

describe("endpoint checks", () => {
  it("does not flag protected admin route", () => {
    const content = `
      export async function GET() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return new Response("Unauthorized", { status: 401 });
        return Response.json({ ok: true });
      }
    `;
    const findings = runEndpointChecks([{ path: "src/app/api/admin/users/route.ts", content }]);
    expect(findings.some((f) => f.ruleId === "ENDPOINT_UNPROTECTED_SENSITIVE")).toBe(false);
  });

  it("flags clearly unprotected sensitive route", () => {
    const content = `
      export async function POST() {
        const rows = await db.from("users").select("*");
        return Response.json(rows);
      }
    `;
    const findings = runEndpointChecks([{ path: "src/app/api/admin/export/route.ts", content }]);
    expect(findings.some((f) => f.ruleId === "ENDPOINT_UNPROTECTED_SENSITIVE")).toBe(true);
  });

  it("marks ambiguous sensitive route for review when auth may exist elsewhere", () => {
    const content = `export async function GET() { return Response.json({ users: [] }); }`;
    const findings = runEndpointChecks([{ path: "src/app/api/users/route.ts", content }]);
    expect(findings.some((f) => f.ruleId === "ENDPOINT_SENSITIVE_NEEDS_REVIEW")).toBe(true);
  });

  it("detects auth mechanism helpers", () => {
    expect(hasAuthMechanism("await supabase.auth.getUser()")).toBe(true);
    expect(hasAuthMechanism("return db.select()")).toBe(false);
  });
});
