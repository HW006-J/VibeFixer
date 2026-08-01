import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSupabaseFiles } from "./fetch-supabase-files";

const REPO = { owner: "some-owner", repo: "some-repo" };

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

function base64Of(content: string): string {
  return Buffer.from(content, "utf-8").toString("base64");
}

/** Routes mock responses by matching a regex against the requested URL, in order. */
function mockFetchRoutes(routes: Array<{ match: RegExp; response: () => Response }>) {
  const fn = vi.fn(async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const route = routes.find((r) => r.match.test(url));
    if (!route) {
      throw new Error(`No mock route for ${url}`);
    }
    return route.response();
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSupabaseFiles", () => {
  it("fetches and decodes permitted files within the limits", async () => {
    mockFetchRoutes([
      { match: /\/repos\/some-owner\/some-repo$/, response: () => jsonResponse({ default_branch: "main" }) },
      {
        match: /\/git\/trees\/main/,
        response: () =>
          jsonResponse({
            truncated: false,
            tree: [
              { path: "supabase/migrations/001.sql", type: "blob", size: 100 },
              { path: "README.md", type: "blob", size: 50 },
              { path: "supabase/schema.sql", type: "blob", size: 50 },
            ],
          }),
      },
      {
        match: /contents\/supabase\/migrations\/001\.sql/,
        response: () => jsonResponse({ encoding: "base64", content: base64Of("create table t();") }),
      },
      {
        match: /contents\/supabase\/schema\.sql/,
        response: () => jsonResponse({ encoding: "base64", content: base64Of("create table s();") }),
      },
    ]);

    const result = await fetchSupabaseFiles(REPO);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files.map((f) => f.path).sort()).toEqual([
        "supabase/migrations/001.sql",
        "supabase/schema.sql",
      ]);
    }
  });

  it("fetches the non-SQL families and never a real .env", async () => {
    mockFetchRoutes([
      { match: /\/repos\/some-owner\/some-repo$/, response: () => jsonResponse({ default_branch: "main" }) },
      {
        match: /\/git\/trees\/main/,
        response: () =>
          jsonResponse({
            truncated: false,
            tree: [
              { path: "firebase.rules", type: "blob", size: 80 },
              { path: "package.json", type: "blob", size: 90 },
              { path: "src/lib/supabaseClient.ts", type: "blob", size: 70 },
              { path: ".env.example", type: "blob", size: 40 },
              // Must never be fetched, even though it sits beside the example.
              { path: ".env", type: "blob", size: 40 },
              { path: ".env.local", type: "blob", size: 40 },
              { path: "node_modules/left-pad/package.json", type: "blob", size: 40 },
            ],
          }),
      },
      {
        match: /contents\/firebase\.rules/,
        response: () => jsonResponse({ encoding: "base64", content: base64Of("{}") }),
      },
      {
        match: /contents\/package\.json/,
        response: () => jsonResponse({ encoding: "base64", content: base64Of("{}") }),
      },
      {
        match: /contents\/src\/lib\/supabaseClient\.ts/,
        response: () => jsonResponse({ encoding: "base64", content: base64Of("export const x = 1;") }),
      },
      {
        match: /contents\/\.env\.example/,
        response: () => jsonResponse({ encoding: "base64", content: base64Of("KEY=") }),
      },
    ]);

    const result = await fetchSupabaseFiles(REPO);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files.map((f) => f.path).sort()).toEqual([
        ".env.example",
        "firebase.rules",
        "package.json",
        "src/lib/supabaseClient.ts",
      ]);
    }
  });

  it("returns NOT_FOUND for a missing or private repository", async () => {
    mockFetchRoutes([
      { match: /\/repos\/some-owner\/some-repo$/, response: () => jsonResponse({}, { status: 404 }) },
    ]);

    const result = await fetchSupabaseFiles(REPO);

    expect(result).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects a truncated tree response instead of under-scanning", async () => {
    mockFetchRoutes([
      { match: /\/repos\/some-owner\/some-repo$/, response: () => jsonResponse({ default_branch: "main" }) },
      { match: /\/git\/trees\/main/, response: () => jsonResponse({ truncated: true, tree: [] }) },
    ]);

    const result = await fetchSupabaseFiles(REPO);

    expect(result).toMatchObject({ ok: false, error: "TREE_TRUNCATED" });
  });

  it("rejects a malformed tree response", async () => {
    mockFetchRoutes([
      { match: /\/repos\/some-owner\/some-repo$/, response: () => jsonResponse({ default_branch: "main" }) },
      { match: /\/git\/trees\/main/, response: () => jsonResponse({ truncated: false }) },
    ]);

    const result = await fetchSupabaseFiles(REPO);

    expect(result).toMatchObject({ ok: false, error: "MALFORMED_RESPONSE" });
  });

  it("rejects more than the maximum permitted number of files without fetching contents", async () => {
    const manyFiles = Array.from({ length: 51 }, (_, i) => ({
      path: `supabase/migrations/${i}.sql`,
      type: "blob",
      size: 10,
    }));

    const contentsFetch = mockFetchRoutes([
      { match: /\/repos\/some-owner\/some-repo$/, response: () => jsonResponse({ default_branch: "main" }) },
      { match: /\/git\/trees\/main/, response: () => jsonResponse({ truncated: false, tree: manyFiles }) },
    ]);

    const result = await fetchSupabaseFiles(REPO);

    expect(result).toMatchObject({ ok: false, error: "TOO_MANY_FILES" });
    expect(contentsFetch.mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false);
  });

  it("rejects a file whose tree-reported size exceeds the per-file limit before fetching it", async () => {
    const contentsFetch = mockFetchRoutes([
      { match: /\/repos\/some-owner\/some-repo$/, response: () => jsonResponse({ default_branch: "main" }) },
      {
        match: /\/git\/trees\/main/,
        response: () =>
          jsonResponse({
            truncated: false,
            tree: [{ path: "supabase/schema.sql", type: "blob", size: 300 * 1024 }],
          }),
      },
    ]);

    const result = await fetchSupabaseFiles(REPO);

    expect(result).toMatchObject({ ok: false, error: "FILE_TOO_LARGE" });
    expect(contentsFetch.mock.calls.some(([url]) => String(url).includes("/contents/"))).toBe(false);
  });

  it("rejects a file whose actual decoded content exceeds the per-file limit", async () => {
    const oversizedContent = "x".repeat(210 * 1024);
    mockFetchRoutes([
      { match: /\/repos\/some-owner\/some-repo$/, response: () => jsonResponse({ default_branch: "main" }) },
      {
        match: /\/git\/trees\/main/,
        response: () =>
          jsonResponse({
            truncated: false,
            tree: [{ path: "supabase/schema.sql", type: "blob" }],
          }),
      },
      {
        match: /contents\/supabase\/schema\.sql/,
        response: () => jsonResponse({ encoding: "base64", content: base64Of(oversizedContent) }),
      },
    ]);

    const result = await fetchSupabaseFiles(REPO);

    expect(result).toMatchObject({ ok: false, error: "FILE_TOO_LARGE" });
  });

  it("rejects when the total downloaded size across files exceeds the maximum", async () => {
    const chunk = "x".repeat(180 * 1024); // under the 200KB per-file limit
    mockFetchRoutes([
      { match: /\/repos\/some-owner\/some-repo$/, response: () => jsonResponse({ default_branch: "main" }) },
      {
        match: /\/git\/trees\/main/,
        response: () =>
          jsonResponse({
            truncated: false,
            tree: [
              { path: "supabase/migrations/001.sql", type: "blob" },
              { path: "supabase/migrations/002.sql", type: "blob" },
              { path: "supabase/migrations/003.sql", type: "blob" },
              { path: "supabase/migrations/004.sql", type: "blob" },
              { path: "supabase/migrations/005.sql", type: "blob" },
              { path: "supabase/migrations/006.sql", type: "blob" },
            ],
          }),
      },
      { match: /contents\//, response: () => jsonResponse({ encoding: "base64", content: base64Of(chunk) }) },
    ]);

    const result = await fetchSupabaseFiles(REPO);

    expect(result).toMatchObject({ ok: false, error: "TOTAL_SIZE_EXCEEDED" });
  });
});
