/**
 * The single source of truth for which repository paths this scanner is
 * allowed to fetch.
 *
 * Static scanning runs against any public GitHub repository, so this
 * function is a security boundary, not a convenience filter. It implements
 * CLAUDE.md's "never fetch .env, credentials, keys or unrelated repository
 * files".
 *
 * Three rules govern every change here:
 *   1. Denied directories are checked first and win outright, so a
 *      permitted filename cannot be smuggled in via node_modules/.
 *   2. Environment files are checked next. Only three exact root-level
 *      template names are ever permitted.
 *   3. The allowlist is exact strings and anchored regexes — never a broad
 *      glob. A pattern like `.env*` would admit a real .env, and
 *      `**\/package.json` would admit thousands of dependency manifests.
 *
 * When in doubt, deny. A file this scanner cannot read produces a missed
 * finding; a file it should never have read produces an incident.
 */

/**
 * Directories whose contents are never fetched, whatever the filename.
 * Dependency trees and build output would blow the resource limits and
 * contain nothing the user wrote; .git may contain packed credentials.
 */
const DENIED_DIRECTORIES = [
  "node_modules/",
  "dist/",
  "build/",
  "out/",
  "coverage/",
  "vendor/",
  ".next/",
  ".git/",
];

/** Root-level example env files. Templates by convention, and safe to read. */
const PERMITTED_ENV_EXAMPLES = new Set([".env.example", ".env.sample", ".env.template"]);

/**
 * Matches any path whose basename begins with `.env`. Checked before the
 * allowlist so that only the exact filenames above can ever get through.
 */
const ENV_FILE = /(^|\/)\.env(\.|$)/;

/** Exact root-level filenames. Anchored by equality, so nested copies are excluded. */
const PERMITTED_ROOT_FILES = new Set(["supabase/schema.sql", "firebase.rules", "package.json"]);

/** One level below supabase/migrations only — no archive/ subdirectories. */
const SUPABASE_MIGRATION = /^supabase\/migrations\/[^/]+\.sql$/;

/**
 * Application source under src/, where hardcoded credentials would live.
 * Deliberately excludes the repository root: root-level scripts are rarely
 * where a generated app puts its Supabase client, and every path admitted
 * here widens the surface.
 */
const APPLICATION_SOURCE = /^src\/(?:[^/]+\/)*[^/]+\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

function isInDeniedDirectory(path: string): boolean {
  return DENIED_DIRECTORIES.some((dir) => path === dir.slice(0, -1) || path.startsWith(dir));
}

export function isPermittedPath(path: string): boolean {
  if (isInDeniedDirectory(path)) return false;

  if (ENV_FILE.test(path)) {
    return PERMITTED_ENV_EXAMPLES.has(path);
  }

  if (PERMITTED_ROOT_FILES.has(path)) return true;
  if (SUPABASE_MIGRATION.test(path)) return true;
  if (APPLICATION_SOURCE.test(path)) return true;

  return false;
}
