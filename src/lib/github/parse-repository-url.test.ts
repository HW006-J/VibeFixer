import { describe, expect, it } from "vitest";
import { parseRepositoryUrl } from "./parse-repository-url";

const ALLOWED_REPOSITORY = "HW006-J/rls-red-alert-demo-target";

describe("parseRepositoryUrl", () => {
  it("accepts the authorised GitHub repository URL", () => {
    const result = parseRepositoryUrl(
      "https://github.com/HW006-J/rls-red-alert-demo-target",
      ALLOWED_REPOSITORY,
    );

    expect(result).toEqual({
      ok: true,
      repository: { owner: "HW006-J", repo: "rls-red-alert-demo-target" },
    });
  });

  it("accepts a trailing .git suffix and slash on the authorised repository", () => {
    const result = parseRepositoryUrl(
      "https://github.com/HW006-J/rls-red-alert-demo-target.git",
      ALLOWED_REPOSITORY,
    );

    expect(result.ok).toBe(true);
  });

  it("rejects a different repository under the same owner", () => {
    const result = parseRepositoryUrl(
      "https://github.com/HW006-J/some-other-repo",
      ALLOWED_REPOSITORY,
    );

    expect(result).toEqual({ ok: false, error: "REPOSITORY_NOT_AUTHORISED" });
  });

  it("rejects a different owner with the same repository name", () => {
    const result = parseRepositoryUrl(
      "https://github.com/some-other-owner/rls-red-alert-demo-target",
      ALLOWED_REPOSITORY,
    );

    expect(result).toEqual({ ok: false, error: "REPOSITORY_NOT_AUTHORISED" });
  });

  it("rejects a non-GitHub host", () => {
    const result = parseRepositoryUrl(
      "https://gitlab.com/HW006-J/rls-red-alert-demo-target",
      ALLOWED_REPOSITORY,
    );

    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_HOST" });
  });

  it("rejects a raw content URL", () => {
    const result = parseRepositoryUrl(
      "https://raw.githubusercontent.com/HW006-J/rls-red-alert-demo-target/main/supabase/schema.sql",
      ALLOWED_REPOSITORY,
    );

    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_HOST" });
  });

  it("rejects a URL with extra path segments", () => {
    const result = parseRepositoryUrl(
      "https://github.com/HW006-J/rls-red-alert-demo-target/tree/main",
      ALLOWED_REPOSITORY,
    );

    expect(result).toEqual({ ok: false, error: "UNSUPPORTED_PATH" });
  });

  it("rejects malformed input", () => {
    const result = parseRepositoryUrl("not a url", ALLOWED_REPOSITORY);
    expect(result).toEqual({ ok: false, error: "INVALID_URL" });
  });

  it("rejects empty input", () => {
    const result = parseRepositoryUrl("   ", ALLOWED_REPOSITORY);
    expect(result).toEqual({ ok: false, error: "EMPTY_INPUT" });
  });
});
