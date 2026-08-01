export type GithubFetchErrorCode =
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "MALFORMED_RESPONSE"
  | "TREE_TRUNCATED"
  | "TOO_MANY_FILES"
  | "FILE_TOO_LARGE"
  | "TOTAL_SIZE_EXCEEDED"
  | "UNKNOWN";

export const GITHUB_API_BASE = "https://api.github.com";
export const GITHUB_REQUEST_TIMEOUT_MS = 10_000;

export const SCAN_MAX_PERMITTED_FILES = 80;
export const SCAN_MAX_FILE_SIZE_BYTES = 200 * 1024;
export const SCAN_MAX_TOTAL_SIZE_BYTES = 2 * 1024 * 1024;

type GithubRequestOptions = {
  token?: string;
};

export async function githubRequest(
  path: string,
  { token }: GithubRequestOptions,
): Promise<{ ok: true; data: unknown } | { ok: false; error: GithubFetchErrorCode; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (response.status === 404) {
      return {
        ok: false,
        error: "NOT_FOUND",
        message:
          "Repository not found. It may be private, misspelled, or deleted — only public repositories can be scanned.",
      };
    }

    if (
      response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0"
    ) {
      return {
        ok: false,
        error: "RATE_LIMITED",
        message: "GitHub API rate limit exceeded. Try again later or configure GITHUB_TOKEN.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: "UNKNOWN",
        message: `GitHub API returned an unexpected status (${response.status}).`,
      };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { ok: false, error: "MALFORMED_RESPONSE", message: "GitHub API returned an invalid response." };
    }

    return { ok: true, data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "TIMEOUT", message: "GitHub API request timed out." };
    }
    return { ok: false, error: "NETWORK_ERROR", message: "Unable to reach the GitHub API." };
  } finally {
    clearTimeout(timeout);
  }
}

export type RepoInfo = { default_branch?: unknown };
export type TreeEntry = { path?: unknown; type?: unknown; size?: unknown };
export type TreeResponse = { tree?: unknown; truncated?: unknown };
export type ContentsResponse = { content?: unknown; encoding?: unknown };
