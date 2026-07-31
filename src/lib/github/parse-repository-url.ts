export type ParsedRepository = {
  owner: string;
  repo: string;
};

export type ParseRepositoryUrlError =
  | "EMPTY_INPUT"
  | "INVALID_URL"
  | "UNSUPPORTED_HOST"
  | "UNSUPPORTED_PATH"
  | "REPOSITORY_NOT_AUTHORISED";

export type ParseRepositoryUrlResult =
  | { ok: true; repository: ParsedRepository }
  | { ok: false; error: ParseRepositoryUrlError };

const ALLOWED_HOSTS = new Set(["github.com", "www.github.com"]);

const OWNER_REPO_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Parses a GitHub repository URL and validates it exactly matches the
 * single authorised repository configured in `allowedRepository`
 * (owner/repo form, e.g. "HW006-J/rls-red-alert-demo-target").
 *
 * Rejects anything that is not a plain `https://github.com/<owner>/<repo>`
 * URL: other hosts, raw content URLs, extra path segments, query strings
 * that imply a different resource, etc.
 */
export function parseRepositoryUrl(
  input: string,
  allowedRepository: string,
): ParseRepositoryUrlResult {
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

  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, error: "UNSUPPORTED_HOST" };
  }

  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);

  if (segments.length !== 2) {
    return { ok: false, error: "UNSUPPORTED_PATH" };
  }

  const [owner, rawRepo] = segments;
  const repo = rawRepo.endsWith(".git") ? rawRepo.slice(0, -4) : rawRepo;

  if (!OWNER_REPO_SEGMENT.test(owner) || !OWNER_REPO_SEGMENT.test(repo)) {
    return { ok: false, error: "UNSUPPORTED_PATH" };
  }

  const [allowedOwner, allowedRepo] = allowedRepository.split("/");

  if (
    !allowedOwner ||
    !allowedRepo ||
    owner.toLowerCase() !== allowedOwner.toLowerCase() ||
    repo.toLowerCase() !== allowedRepo.toLowerCase()
  ) {
    return { ok: false, error: "REPOSITORY_NOT_AUTHORISED" };
  }

  return { ok: true, repository: { owner: allowedOwner, repo: allowedRepo } };
}
