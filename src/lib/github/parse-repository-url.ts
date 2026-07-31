export type ParsedRepository = {
  owner: string;
  repo: string;
};

export type ParseRepositoryUrlError =
  | "EMPTY_INPUT"
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "UNSUPPORTED_HOST"
  | "CREDENTIALS_NOT_ALLOWED"
  | "UNSUPPORTED_PATH"
  | "INVALID_OWNER_OR_REPO";

export type ParseRepositoryUrlResult =
  | { ok: true; repository: ParsedRepository }
  | { ok: false; error: ParseRepositoryUrlError };

const ALLOWED_HOSTS = new Set(["github.com", "www.github.com"]);

// GitHub usernames/orgs: alphanumeric, may contain single hyphens, max 39 chars.
const OWNER_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
// GitHub repo names: alphanumeric, dot, hyphen, underscore, max 100 chars.
const REPO_SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;

function isValidOwner(owner: string): boolean {
  return OWNER_SEGMENT.test(owner);
}

function isValidRepo(repo: string): boolean {
  return REPO_SEGMENT.test(repo) && repo !== "." && repo !== "..";
}

/**
 * Parses and validates a public GitHub repository URL of the form
 * `https://github.com/<owner>/<repo>`, safely normalising a trailing slash
 * or `.git` suffix.
 *
 * Rejects anything else: non-GitHub hosts (including raw-content and API
 * hosts), unsupported protocols, URLs with embedded credentials, subpaths
 * (tree/blob/issues/pull/commit/...), and malformed owner or repo names.
 *
 * This function only validates shape — it does not check the repository
 * against any allowlist. Callers that need to restrict an operation (e.g.
 * live validation) to one specific repository must check the returned
 * owner/repo themselves, e.g. with `isSameRepository`.
 */
export function parseRepositoryUrl(input: string): ParseRepositoryUrlResult {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "EMPTY_INPUT" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "INVALID_URL" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "UNSUPPORTED_PROTOCOL" };
  }

  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, error: "UNSUPPORTED_HOST" };
  }

  if (url.username !== "" || url.password !== "") {
    return { ok: false, error: "CREDENTIALS_NOT_ALLOWED" };
  }

  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);

  if (segments.length !== 2) {
    return { ok: false, error: "UNSUPPORTED_PATH" };
  }

  const [owner, rawRepo] = segments;
  const repo = rawRepo.endsWith(".git") ? rawRepo.slice(0, -4) : rawRepo;

  if (!isValidOwner(owner) || !isValidRepo(repo)) {
    return { ok: false, error: "INVALID_OWNER_OR_REPO" };
  }

  return { ok: true, repository: { owner, repo } };
}

/** True when the parsed repository matches "owner/repo" exactly, case-insensitively. */
export function isSameRepository(repository: ParsedRepository, ownerSlashRepo: string): boolean {
  const [allowedOwner, allowedRepo] = ownerSlashRepo.split("/");
  return (
    !!allowedOwner &&
    !!allowedRepo &&
    repository.owner.toLowerCase() === allowedOwner.toLowerCase() &&
    repository.repo.toLowerCase() === allowedRepo.toLowerCase()
  );
}
