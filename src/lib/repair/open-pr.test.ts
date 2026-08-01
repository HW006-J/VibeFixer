import { afterEach, describe, expect, it, vi } from "vitest";
import { openTrustedRepairPullRequest } from "./open-pr";
import { REPAIR_SQL } from "./trusted-repair";

const REPO = { owner: "HW006-J", repo: "rls-red-alert-demo-target" };
const STAMP = "20260801150000";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Call = { url: string; init?: RequestInit };

/**
 * Records every request so tests can assert on what was sent, not only on
 * what came back. The token must never appear in a place we did not intend.
 */
function mockGithub(overrides: Array<{ match: RegExp; response: () => Response }> = []) {
  const calls: Call[] = [];

  const fn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });

    const override = overrides.find((o) => o.match.test(url));
    if (override) return override.response();

    if (/\/git\/ref\/heads\//.test(url)) return jsonResponse({ object: { sha: "base-sha" } });
    if (/\/git\/refs$/.test(url)) return jsonResponse({ ref: "refs/heads/x" }, 201);
    if (/\/contents\//.test(url)) return jsonResponse({ commit: { sha: "commit-sha" } }, 201);
    if (/\/pulls$/.test(url)) {
      return jsonResponse({ html_url: "https://github.com/HW006-J/rls-red-alert-demo-target/pull/7", number: 7 }, 201);
    }
    if (/\/repos\/[^/]+\/[^/]+$/.test(url)) return jsonResponse({ default_branch: "main" });

    throw new Error(`No mock route for ${url}`);
  });

  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("openTrustedRepairPullRequest — authorisation", () => {
  it("refuses without a configured token and makes no network call at all", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    const { fn } = mockGithub();

    const result = await openTrustedRepairPullRequest(REPO, { stamp: STAMP });

    expect(result).toMatchObject({ ok: false, error: "TOKEN_MISSING" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("refuses a repository other than the configured demo target", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test_token_value");
    vi.stubEnv("DEMO_GITHUB_REPOSITORY", "HW006-J/rls-red-alert-demo-target");
    const { fn } = mockGithub();

    const result = await openTrustedRepairPullRequest(
      { owner: "someone-else", repo: "their-repo" },
      { stamp: STAMP },
    );

    expect(result).toMatchObject({ ok: false, error: "REPOSITORY_NOT_AUTHORISED" });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("openTrustedRepairPullRequest — what gets committed", () => {
  it("commits exactly the trusted repair SQL, never caller-supplied text", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test_token_value");
    vi.stubEnv("DEMO_GITHUB_REPOSITORY", "HW006-J/rls-red-alert-demo-target");
    const { calls } = mockGithub();

    const result = await openTrustedRepairPullRequest(REPO, { stamp: STAMP });

    expect(result.ok).toBe(true);

    const contentsCall = calls.find((c) => c.url.includes("/contents/"));
    expect(contentsCall).toBeDefined();

    const body = JSON.parse(String(contentsCall!.init!.body));
    const committed = Buffer.from(body.content, "base64").toString("utf-8");

    expect(committed).toContain(REPAIR_SQL);
  });

  it("returns the real pull request URL from GitHub's response", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test_token_value");
    vi.stubEnv("DEMO_GITHUB_REPOSITORY", "HW006-J/rls-red-alert-demo-target");
    mockGithub();

    const result = await openTrustedRepairPullRequest(REPO, { stamp: STAMP });

    expect(result).toMatchObject({
      ok: true,
      pullRequestUrl: "https://github.com/HW006-J/rls-red-alert-demo-target/pull/7",
    });
  });

  it("writes the migration under supabase/migrations with the given stamp", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test_token_value");
    vi.stubEnv("DEMO_GITHUB_REPOSITORY", "HW006-J/rls-red-alert-demo-target");
    const { calls } = mockGithub();

    await openTrustedRepairPullRequest(REPO, { stamp: STAMP });

    const contentsCall = calls.find((c) => c.url.includes("/contents/"));
    expect(contentsCall!.url).toContain(`supabase/migrations/${STAMP}`);
  });
});

describe("openTrustedRepairPullRequest — the token never leaks", () => {
  const TOKEN = "ghp_supersecrettokenvalue123456";

  it("never puts the token in the returned message on failure", async () => {
    vi.stubEnv("GITHUB_TOKEN", TOKEN);
    vi.stubEnv("DEMO_GITHUB_REPOSITORY", "HW006-J/rls-red-alert-demo-target");
    mockGithub([{ match: /\/pulls$/, response: () => jsonResponse({ message: `Bad credentials ${TOKEN}` }, 401) }]);

    const result = await openTrustedRepairPullRequest(REPO, { stamp: STAMP });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain(TOKEN);
    }
  });

  it("sends the token only in the Authorization header, never in a URL", async () => {
    vi.stubEnv("GITHUB_TOKEN", TOKEN);
    vi.stubEnv("DEMO_GITHUB_REPOSITORY", "HW006-J/rls-red-alert-demo-target");
    const { calls } = mockGithub();

    await openTrustedRepairPullRequest(REPO, { stamp: STAMP });

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.url).not.toContain(TOKEN);
      expect(String(call.init?.body ?? "")).not.toContain(TOKEN);
    }
  });
});

describe("openTrustedRepairPullRequest — failure handling", () => {
  it("maps a 401 to an invalid-token outcome, distinct from insufficient permission", async () => {
    // 401 and 403 mean different things and need different fixes: 401 is
    // "this token is not valid" (revoked, expired, or a stale deployment
    // still running an old value), 403 is "this token is valid but may not
    // do that". Collapsing them makes the fault unfindable from the
    // response alone.
    vi.stubEnv("GITHUB_TOKEN", "ghp_test_token_value");
    vi.stubEnv("DEMO_GITHUB_REPOSITORY", "HW006-J/rls-red-alert-demo-target");
    mockGithub([{ match: /\/git\/refs$/, response: () => jsonResponse({ message: "Bad credentials" }, 401) }]);

    const result = await openTrustedRepairPullRequest(REPO, { stamp: STAMP });

    expect(result).toMatchObject({ ok: false, error: "GITHUB_TOKEN_INVALID" });
  });

  it("maps a 403 to a forbidden outcome rather than a generic failure", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test_token_value");
    vi.stubEnv("DEMO_GITHUB_REPOSITORY", "HW006-J/rls-red-alert-demo-target");
    mockGithub([{ match: /\/git\/refs$/, response: () => jsonResponse({ message: "Resource not accessible" }, 403) }]);

    const result = await openTrustedRepairPullRequest(REPO, { stamp: STAMP });

    expect(result).toMatchObject({ ok: false, error: "GITHUB_FORBIDDEN" });
  });

  it("does not open a pull request when the branch could not be created", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test_token_value");
    vi.stubEnv("DEMO_GITHUB_REPOSITORY", "HW006-J/rls-red-alert-demo-target");
    const { calls } = mockGithub([
      { match: /\/git\/refs$/, response: () => jsonResponse({ message: "nope" }, 422) },
    ]);

    const result = await openTrustedRepairPullRequest(REPO, { stamp: STAMP });

    expect(result.ok).toBe(false);
    expect(calls.some((c) => /\/pulls$/.test(c.url))).toBe(false);
  });
});
