import { afterEach, describe, expect, it, vi } from "vitest";
import { readDemoSupabaseConfig, runLiveValidation } from "./live-validate";

const CONFIG = {
  url: "https://demo-project.supabase.co",
  anonKey: "anon-key-for-tests",
  attackerEmail: "trainer-a@rls-red-alert-demo.test",
  attackerPassword: "not-a-real-password",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("runLiveValidation", () => {
  it("signs in as the attacker and classifies own vs. another trainer's rows", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/auth/v1/token")) {
        return jsonResponse({ access_token: "real-jwt-for-test", user: { id: "attacker-id" } });
      }
      if (url.includes("/rest/v1/clients")) {
        return jsonResponse([
          { id: "1", trainer_id: "attacker-id", name: "Own Client", email: "a@example.test", private_notes: "mine" },
          {
            id: "2",
            trainer_id: "victim-id",
            name: "Victim Client",
            email: "v@example.test",
            private_notes: "CONFIDENTIAL",
          },
        ]);
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await runLiveValidation(CONFIG);

    expect(outcome).toMatchObject({
      ok: true,
      attackerUserId: "attacker-id",
      totalRowsReturned: 2,
      ownRowCount: 1,
      leakedRowCount: 1,
    });
    if (outcome.ok) {
      expect(outcome.leakedRows).toEqual([
        { id: "2", trainerId: "victim-id", name: "Victim Client", email: "v@example.test", privateNotes: "CONFIDENTIAL" },
      ]);
    }
  });

  it("reports SIGN_IN_FAILED honestly when the sign-in request fails, without fabricating success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "invalid_grant", error_description: "Invalid login credentials" }, 400)),
    );

    const outcome = await runLiveValidation(CONFIG);

    expect(outcome).toMatchObject({ ok: false, error: "SIGN_IN_FAILED" });
  });

  it("reports QUERY_FAILED when the authenticated query itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/token")) {
          return jsonResponse({ access_token: "jwt", user: { id: "attacker-id" } });
        }
        return jsonResponse({ message: "server error" }, 500);
      }),
    );

    const outcome = await runLiveValidation(CONFIG);

    expect(outcome).toMatchObject({ ok: false, error: "QUERY_FAILED" });
  });

  it("reports zero leaked rows honestly when only the attacker's own rows come back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/auth/v1/token")) {
          return jsonResponse({ access_token: "jwt", user: { id: "attacker-id" } });
        }
        return jsonResponse([{ id: "1", trainer_id: "attacker-id", name: "Own", email: null, private_notes: null }]);
      }),
    );

    const outcome = await runLiveValidation(CONFIG);

    expect(outcome).toMatchObject({ ok: true, totalRowsReturned: 1, ownRowCount: 1, leakedRowCount: 0 });
  });
});

describe("readDemoSupabaseConfig", () => {
  it("returns null when any required env var is missing", () => {
    vi.stubEnv("DEMO_SUPABASE_URL", "");
    vi.stubEnv("DEMO_SUPABASE_ANON_KEY", "key");
    vi.stubEnv("DEMO_ATTACKER_EMAIL", "a@example.test");
    vi.stubEnv("DEMO_ATTACKER_PASSWORD", "pw");

    expect(readDemoSupabaseConfig()).toBeNull();
  });

  it("returns the config when all required env vars are present", () => {
    vi.stubEnv("DEMO_SUPABASE_URL", "https://demo.supabase.co");
    vi.stubEnv("DEMO_SUPABASE_ANON_KEY", "key");
    vi.stubEnv("DEMO_ATTACKER_EMAIL", "a@example.test");
    vi.stubEnv("DEMO_ATTACKER_PASSWORD", "pw");

    expect(readDemoSupabaseConfig()).toEqual({
      url: "https://demo.supabase.co",
      anonKey: "key",
      attackerEmail: "a@example.test",
      attackerPassword: "pw",
    });
  });
});
