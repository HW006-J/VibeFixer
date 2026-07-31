import type { ScannedFile } from "../scanner/types";
import type { ParsedRepository } from "./parse-repository-url";

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

export type FetchSupabaseFilesResult =
  | { ok: true; files: ScannedFile[] }
  | { ok: false; error: GithubFetchErrorCode; message: string };

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;

const SUPABASE_MIGRATION_PATH = /^supabase\/migrations\/[^/]+\.sql$/;
const SUPABASE_SCHEMA_PATH = "supabase/schema.sql";

// Deterministic resource limits so a public deployment cannot be forced to
// process arbitrarily large repositories.
const MAX_PERMITTED_FILES = 50;
const MAX_FILE_SIZE_BYTES = 200 * 1024; // 200 KB
const MAX_TOTAL_SIZE_BYTES = 1024 * 1024; // 1 MB

function isPermittedPath(path: string): boolean {
  return SUPABASE_MIGRATION_PATH.test(path) || path === SUPABASE_SCHEMA_PATH;
}

type GithubRequestOptions = {
  token?: string;
};

async function githubRequest(
  path: string,
  { token }: GithubRequestOptions,
): Promise<{ ok: true; data: unknown } | { ok: false; error: GithubFetchErrorCode; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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

type RepoInfo = { default_branch?: unknown };
type TreeEntry = { path?: unknown; type?: unknown; size?: unknown };
type TreeResponse = { tree?: unknown; truncated?: unknown };
type ContentsResponse = { content?: unknown; encoding?: unknown };

/**
 * Fetches only the permitted Supabase SQL files (`supabase/migrations/*.sql`
 * and, if present, `supabase/schema.sql`) from the given public repository
 * using the GitHub REST API. No other paths are ever requested, and no raw
 * content URL is ever accepted or constructed from user input.
 */
export async function fetchSupabaseFiles(
  repository: ParsedRepository,
  token?: string,
): Promise<FetchSupabaseFilesResult> {
  const { owner, repo } = repository;

  const repoResult = await githubRequest(`/repos/${owner}/${repo}`, { token });
  if (!repoResult.ok) return repoResult;

  const repoInfo = repoResult.data as RepoInfo;
  const defaultBranch = typeof repoInfo.default_branch === "string" ? repoInfo.default_branch : null;
  if (!defaultBranch) {
    return { ok: false, error: "MALFORMED_RESPONSE", message: "Repository response was missing a default branch." };
  }

  const treeResult = await githubRequest(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
    { token },
  );
  if (!treeResult.ok) return treeResult;

  const treeData = treeResult.data as TreeResponse;
  if (!Array.isArray(treeData.tree)) {
    return { ok: false, error: "MALFORMED_RESPONSE", message: "Repository tree response was malformed." };
  }

  if (treeData.truncated === true) {
    return {
      ok: false,
      error: "TREE_TRUNCATED",
      message:
        "The repository's file tree is too large for GitHub to return in full, so the scan was aborted to avoid missing files.",
    };
  }

  const permittedEntries = (treeData.tree as TreeEntry[]).filter(
    (entry) => entry.type === "blob" && typeof entry.path === "string" && isPermittedPath(entry.path),
  );

  if (permittedEntries.length > MAX_PERMITTED_FILES) {
    return {
      ok: false,
      error: "TOO_MANY_FILES",
      message: `This repository has ${permittedEntries.length} permitted SQL files, which exceeds the maximum of ${MAX_PERMITTED_FILES} files this scanner will process.`,
    };
  }

  const files: ScannedFile[] = [];
  let totalBytes = 0;

  for (const entry of permittedEntries) {
    const path = entry.path as string;

    if (typeof entry.size === "number" && entry.size > MAX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        error: "FILE_TOO_LARGE",
        message: `"${path}" is ${entry.size} bytes, which exceeds the maximum of ${MAX_FILE_SIZE_BYTES} bytes (200 KB) per file.`,
      };
    }

    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const contentsResult = await githubRequest(
      `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(defaultBranch)}`,
      { token },
    );
    if (!contentsResult.ok) return contentsResult;

    const contentsData = contentsResult.data as ContentsResponse;
    if (contentsData.encoding !== "base64" || typeof contentsData.content !== "string") {
      return {
        ok: false,
        error: "MALFORMED_RESPONSE",
        message: `GitHub did not return readable content for "${path}".`,
      };
    }

    const decodedBuffer = Buffer.from(contentsData.content, "base64");

    if (decodedBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        error: "FILE_TOO_LARGE",
        message: `"${path}" is ${decodedBuffer.byteLength} bytes, which exceeds the maximum of ${MAX_FILE_SIZE_BYTES} bytes (200 KB) per file.`,
      };
    }

    totalBytes += decodedBuffer.byteLength;
    if (totalBytes > MAX_TOTAL_SIZE_BYTES) {
      return {
        ok: false,
        error: "TOTAL_SIZE_EXCEEDED",
        message: `The total size of permitted SQL files exceeds the maximum of ${MAX_TOTAL_SIZE_BYTES} bytes (1 MB) this scanner will download.`,
      };
    }

    files.push({ path, content: decodedBuffer.toString("utf-8") });
  }

  return { ok: true, files };
}
