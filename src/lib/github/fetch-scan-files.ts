import type { ScannedFile } from "../scanner/types";
import type { ParsedRepository } from "./parse-repository-url";
import {
  githubRequest,
  SCAN_MAX_FILE_SIZE_BYTES,
  SCAN_MAX_PERMITTED_FILES,
  SCAN_MAX_TOTAL_SIZE_BYTES,
  type ContentsResponse,
  type GithubFetchErrorCode,
  type RepoInfo,
  type TreeEntry,
  type TreeResponse,
} from "./github-client";

export type { GithubFetchErrorCode };

export type FetchScanFilesResult =
  | { ok: true; files: ScannedFile[] }
  | { ok: false; error: GithubFetchErrorCode; message: string };

const SUPABASE_MIGRATION_PATH = /^supabase\/migrations\/[^/]+\.sql$/;
const SUPABASE_SCHEMA_PATH = "supabase/schema.sql";

const SECRET_SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml", ".mjs", ".cjs"]);

const NEXT_APP_API_ROUTE = /^(?:src\/)?app\/api\/(?:[^/]+\/)*route\.(?:ts|tsx|js|jsx)$/;
const NEXT_PAGES_API = /^(?:src\/)?pages\/api\/(?:.+\/)*[^/]+\.(?:ts|tsx|js|jsx)$/;

const IAM_JSON_HINT =
  /(?:^|\/)(?:iam|policies|policy|trust|role)[^/]*\.json$|[^/]*(?:policy|iam|trust)[^/]*\.json$/i;

const SAFE_YAML_HINT =
  /(?:^|\/)(?:serverless|cloudformation|template|sam|infra)[^/]*\.ya?ml$|(?:^|\/)template\.ya?ml$/i;

const SECRET_CONFIG_HINT =
  /(?:^|\/)(?:next\.config\.(?:ts|js|mjs)|config\/[^/]+\.(?:ts|js)|[^/]*\.config\.(?:ts|js))$/;

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function isEnvFile(path: string): boolean {
  const name = basename(path).toLowerCase();
  if (name === ".env" || name.startsWith(".env.")) return true;
  return false;
}

function hasExtension(path: string, ext: string): boolean {
  return path.toLowerCase().endsWith(ext);
}

function isPermittedScanPath(path: string): boolean {
  if (isEnvFile(path)) return false;

  if (SUPABASE_MIGRATION_PATH.test(path) || path === SUPABASE_SCHEMA_PATH) {
    return true;
  }

  if (NEXT_APP_API_ROUTE.test(path) || NEXT_PAGES_API.test(path)) {
    return true;
  }

  const lower = path.toLowerCase();
  if (IAM_JSON_HINT.test(path) && hasExtension(lower, ".json")) {
    return true;
  }

  if (SAFE_YAML_HINT.test(path) && (hasExtension(lower, ".yaml") || hasExtension(lower, ".yml"))) {
    return true;
  }

  for (const ext of SECRET_SCAN_EXTENSIONS) {
    if (!lower.endsWith(ext)) continue;
    if (SECRET_CONFIG_HINT.test(path)) return true;
    if (path.includes("/lib/") || path.includes("/src/")) return true;
    if (hasExtension(lower, ".json") && IAM_JSON_HINT.test(path)) return true;
  }

  return false;
}

/**
 * Bounded fetch of repository files for the unified Vibe Fixer scanner.
 * Never requests `.env` or other credential files from arbitrary repositories.
 */
export async function fetchScanFiles(
  repository: ParsedRepository,
  token?: string,
): Promise<FetchScanFilesResult> {
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
    (entry) => entry.type === "blob" && typeof entry.path === "string" && isPermittedScanPath(entry.path),
  );

  if (permittedEntries.length > SCAN_MAX_PERMITTED_FILES) {
    return {
      ok: false,
      error: "TOO_MANY_FILES",
      message: `This repository has ${permittedEntries.length} scannable files, which exceeds the maximum of ${SCAN_MAX_PERMITTED_FILES} files this scanner will process.`,
    };
  }

  const files: ScannedFile[] = [];
  let totalBytes = 0;

  for (const entry of permittedEntries) {
    const path = entry.path as string;

    if (typeof entry.size === "number" && entry.size > SCAN_MAX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        error: "FILE_TOO_LARGE",
        message: `"${path}" is ${entry.size} bytes, which exceeds the maximum of ${SCAN_MAX_FILE_SIZE_BYTES} bytes (200 KB) per file.`,
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

    if (decodedBuffer.byteLength > SCAN_MAX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        error: "FILE_TOO_LARGE",
        message: `"${path}" is ${decodedBuffer.byteLength} bytes, which exceeds the maximum of ${SCAN_MAX_FILE_SIZE_BYTES} bytes (200 KB) per file.`,
      };
    }

    totalBytes += decodedBuffer.byteLength;
    if (totalBytes > SCAN_MAX_TOTAL_SIZE_BYTES) {
      return {
        ok: false,
        error: "TOTAL_SIZE_EXCEEDED",
        message: `The total size of scannable files exceeds the maximum of ${SCAN_MAX_TOTAL_SIZE_BYTES} bytes (2 MB) this scanner will download.`,
      };
    }

    files.push({ path, content: decodedBuffer.toString("utf-8") });
  }

  return { ok: true, files };
}

/** @internal Exported for unit tests */
export const scanPathRules = {
  isPermittedScanPath,
  isEnvFile,
};
