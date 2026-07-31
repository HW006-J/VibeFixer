import { describe, expect, it } from "vitest";
import { isSameRepository, parseRepositoryUrl } from "./parse-repository-url";

describe("parseRepositoryUrl", () => {
  it("accepts a normal public GitHub repository URL", () => {
    const result = parseRepositoryUrl("https://github.com/vercel/next.js");

    expect(result).toEqual({
      ok: true,
      repository: { owner: "vercel", repo: "next.js" },
    });
  });

  it("accepts the authorised demo repository URL like any other public repo", () => {
    const result = parseRepositoryUrl("https://github.com/HW006-J/rls-red-alert-demo-target");

    expect(result).toEqual({
      ok: true,
      repository: { owner: "HW006-J", repo: "rls-red-alert-demo-target" },
    });
  });

  it("normalises a trailing slash", () => {
    const result = parseRepositoryUrl("https://github.com/vercel/next.js/");
    expect(result).toEqual({
      ok: true,
      repository: { owner: "vercel", repo: "next.js" },
    });
  });

  it("normalises a trailing .git suffix", () => {
    const result = parseRepositoryUrl("https://github.com/vercel/next.js.git");
    expect(result).toEqual({
      ok: true,
      repository: { owner: "vercel", repo: "next.js" },
    });
  });

  it("rejects a non-GitHub host", () => {
    const result = parseRepositoryUrl("https://gitlab.com/vercel/next.js");
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_HOST" });
  });

  it("rejects a raw-content URL", () => {
    const result = parseRepositoryUrl(
      "https://raw.githubusercontent.com/vercel/next.js/main/package.json",
    );
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_HOST" });
  });

  it("rejects a GitHub API URL", () => {
    const result = parseRepositoryUrl("https://api.github.com/repos/vercel/next.js");
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_HOST" });
  });

  it("rejects a repository subpath (tree)", () => {
    const result = parseRepositoryUrl("https://github.com/vercel/next.js/tree/canary");
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_PATH" });
  });

  it("rejects a repository subpath (blob)", () => {
    const result = parseRepositoryUrl(
      "https://github.com/vercel/next.js/blob/canary/package.json",
    );
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_PATH" });
  });

  it("rejects an issue URL", () => {
    const result = parseRepositoryUrl("https://github.com/vercel/next.js/issues/1234");
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_PATH" });
  });

  it("rejects a pull request URL", () => {
    const result = parseRepositoryUrl("https://github.com/vercel/next.js/pull/1234");
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_PATH" });
  });

  it("rejects a commit URL", () => {
    const result = parseRepositoryUrl(
      "https://github.com/vercel/next.js/commit/abcdef1234567890",
    );
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_PATH" });
  });

  it("rejects a URL with only an owner and no repository", () => {
    const result = parseRepositoryUrl("https://github.com/vercel");
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_PATH" });
  });

  it("rejects a bare host with no owner or repository", () => {
    const result = parseRepositoryUrl("https://github.com/");
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_PATH" });
  });

  it("rejects a malformed owner name", () => {
    const result = parseRepositoryUrl("https://github.com/-bad-owner/repo");
    expect(result).toEqual({ ok: false, error: "INVALID_OWNER_OR_REPO" });
  });

  it("rejects a repository name containing invalid characters", () => {
    const result = parseRepositoryUrl("https://github.com/owner/repo name");
    expect(result).toEqual({ ok: false, error: "INVALID_OWNER_OR_REPO" });
  });

  it("rejects a URL containing embedded credentials", () => {
    const result = parseRepositoryUrl("https://user:pass@github.com/vercel/next.js");
    expect(result).toEqual({ ok: false, error: "CREDENTIALS_NOT_ALLOWED" });
  });

  it("rejects an unsupported protocol", () => {
    const result = parseRepositoryUrl("git://github.com/vercel/next.js");
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_PROTOCOL" });
  });

  it("rejects http (non-https)", () => {
    const result = parseRepositoryUrl("http://github.com/vercel/next.js");
    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_PROTOCOL" });
  });

  it("rejects malformed input that isn't a URL", () => {
    const result = parseRepositoryUrl("not a url");
    expect(result).toEqual({ ok: false, error: "INVALID_URL" });
  });

  it("rejects empty input", () => {
    const result = parseRepositoryUrl("   ");
    expect(result).toEqual({ ok: false, error: "EMPTY_INPUT" });
  });
});

describe("isSameRepository", () => {
  it("matches the same owner/repo case-insensitively", () => {
    expect(
      isSameRepository({ owner: "HW006-J", repo: "rls-red-alert-demo-target" }, "hw006-j/RLS-Red-Alert-Demo-Target"),
    ).toBe(true);
  });

  it("does not match a different repository", () => {
    expect(isSameRepository({ owner: "vercel", repo: "next.js" }, "HW006-J/rls-red-alert-demo-target")).toBe(
      false,
    );
  });

  it("does not match a different owner with the same repo name", () => {
    expect(
      isSameRepository({ owner: "someone-else", repo: "rls-red-alert-demo-target" }, "HW006-J/rls-red-alert-demo-target"),
    ).toBe(false);
  });
});
