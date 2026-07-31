import { isSameRepository, parseRepositoryUrl, type ParsedRepository } from "./parse-repository-url";

export type DemoRepositoryCheck =
  | { ok: true; repository: ParsedRepository }
  | { ok: false; code: string; message: string; status: number };

/**
 * Shared gate for every repair-flow route (propose/apply/reset): the
 * request must name exactly the repository configured in
 * DEMO_GITHUB_REPOSITORY, mirroring the existing live-validate gate.
 * Nothing in the repair flow ever touches a repository or database other
 * than the one preconfigured demonstration project.
 */
export function requireDemoRepository(repositoryUrl: unknown): DemoRepositoryCheck {
  const demoRepository = process.env.DEMO_GITHUB_REPOSITORY;
  if (!demoRepository) {
    return {
      ok: false,
      code: "SERVER_MISCONFIGURED",
      message: "The server is not configured with a demonstration repository.",
      status: 500,
    };
  }

  if (typeof repositoryUrl !== "string") {
    return { ok: false, code: "INVALID_REQUEST", message: '"repositoryUrl" must be a string.', status: 400 };
  }

  const parsed = parseRepositoryUrl(repositoryUrl);
  if (!parsed.ok) {
    return { ok: false, code: parsed.error, message: "That repository URL is not valid.", status: 400 };
  }

  if (!isSameRepository(parsed.repository, demoRepository)) {
    return {
      ok: false,
      code: "LIVE_VALIDATION_NOT_AVAILABLE",
      message: "This action requires an authorised connected test environment.",
      status: 403,
    };
  }

  return { ok: true, repository: parsed.repository };
}
