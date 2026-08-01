import type { ScannedFile } from "../scanner/types";
import type { ParsedRepository } from "./parse-repository-url";
import { isPermittedPath } from "./path-policy";
import {
  githubRequest,
  type ContentsResponse,
  type GithubFetchErrorCode,
  type RepoInfo,
  type TreeEntry,
  type TreeResponse,
} from "./github-client";

export type { GithubFetchErrorCode };

export type FetchSupabaseFilesResult =
  | { ok: true; files: ScannedFile[] }
  | { ok: false; error: GithubFetchErrorCode; message: string };

const MAX_PERMITTED_FILES = 50;
const MAX_FILE_SIZE_BYTES = 200 * 1024;
const MAX_TOTAL_SIZE_BYTES = 1024 * 1024;

/**
 * Fetches the permitted files from the given public repository using the
 * GitHub REST API. What "permitted" means lives in `path-policy.ts` and
 * nowhere else — it covers Supabase SQL plus the non-SQL families the audit
 * engine understands, and it denies environment files, dependency trees and
 * build output outright.
 *
 * No other paths are ever requested, and no raw content URL is ever
 * accepted or constructed from user input.
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
