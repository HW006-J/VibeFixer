import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  REPAIR_SQL,
  REPAIR_TARGET_POLICY_NAME,
  REPAIR_TARGET_TABLE,
  RESET_SQL,
} from "./trusted-repair";

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 25_000;
const PREFLIGHT_TIMEOUT_MS = 10_000;
const PROJECT_ROOT_SEARCH_DEPTH = 6;

export type DbAdminErrorCode =
  | "CLI_UNAVAILABLE"
  | "PROJECT_ROOT_NOT_FOUND"
  | "PROJECT_NOT_LINKED"
  | "PROJECT_LINK_MISMATCH"
  | "CLI_UNAUTHENTICATED"
  | "CLI_TIMEOUT"
  | "CLI_FAILED"
  | "MALFORMED_RESPONSE";

export type DbAdminOutcome = { ok: true } | { ok: false; error: DbAdminErrorCode; message: string };

const MESSAGES: Record<DbAdminErrorCode, string> = {
  CLI_UNAVAILABLE:
    "The Supabase CLI could not be found on this server (checked SUPABASE_CLI_PATH, common install locations, and PATH). Mutations are disabled until this is fixed.",
  PROJECT_ROOT_NOT_FOUND:
    "Could not locate the linked Supabase project directory (supabase/) from the server process's working directory. Mutations are disabled.",
  PROJECT_NOT_LINKED:
    "The Supabase CLI on this server is not linked to a project. Mutations are disabled until `supabase link` has been run for the demo project.",
  PROJECT_LINK_MISMATCH:
    "The Supabase CLI on this server is linked to a different Supabase project than the configured demo database. Refusing to run any mutation for safety.",
  CLI_UNAUTHENTICATED:
    "The Supabase CLI on this server does not have an active authenticated session. Mutations are disabled until `supabase login` has been run.",
  CLI_TIMEOUT: "Timed out running the database command.",
  CLI_FAILED: "The Supabase CLI reported a failure while running the database command. Check the server logs for a sanitised error summary.",
  MALFORMED_RESPONSE: "Could not read the current live policy state.",
};

/**
 * Known install locations for the Supabase CLI, checked in order, plus an
 * explicit SUPABASE_CLI_PATH override. This exists because GUI- or
 * editor-launched Node processes on macOS frequently do not inherit the
 * PATH additions an interactive shell's profile (.zshrc/.zprofile) makes —
 * e.g. Homebrew's /opt/homebrew/bin — even though `supabase` resolves fine
 * from a Terminal. Resolving to an absolute path here removes the
 * dependency on whatever PATH happened to be inherited by the parent
 * process that started `next dev`/`next start`.
 */
function resolveCliExecutable(): string {
  const candidates = [
    process.env.SUPABASE_CLI_PATH,
    "/opt/homebrew/bin/supabase",
    "/usr/local/bin/supabase",
    "/usr/bin/supabase",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // Last resort: rely on the child process's inherited PATH. Kept as a
  // fallback rather than a hard failure so this still works in
  // environments where `supabase` genuinely is on PATH but not at one of
  // the well-known locations above.
  return "supabase";
}

/**
 * Locates the project root by walking up from the server process's cwd
 * looking for a supabase/ directory, rather than trusting process.cwd()
 * directly. `next dev`/`next start` normally run with cwd already at the
 * project root, but this makes the mutation path resilient to launch
 * contexts (task runners, process managers) that set a different cwd.
 *
 * Deliberately checks for the supabase/ directory itself, not
 * supabase/config.toml — this project was set up via `supabase link`
 * without `supabase init`, so config.toml (which init scaffolds and which
 * only matters for the local dev stack, not `db query --linked`) does not
 * exist here. The directory that does reliably exist once linked is
 * supabase/.temp/, checked separately by readLinkedProjectRef below.
 */
function resolveProjectRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < PROJECT_ROOT_SEARCH_DEPTH; i++) {
    if (existsSync(join(dir, "supabase"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readLinkedProjectRef(projectRoot: string): string | null {
  try {
    return readFileSync(join(projectRoot, "supabase", ".temp", "project-ref"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

function extractProjectRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url);
  return match ? match[1] : null;
}

/**
 * Redacts anything that looks like a credential before it ever reaches a
 * server log line: long token-like strings (JWTs, API keys) and
 * key=value/key: value pairs for common secret field names. Defence in
 * depth — the HTTP response never includes raw CLI output regardless.
 */
function sanitizeForLog(text: string): string {
  return text
    .replace(/[A-Za-z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/(password|passwd|secret|token|key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

type RunSqlResult = { ok: true; stdout: string } | { ok: false; error: DbAdminErrorCode; message: string };

/**
 * Runs one fixed, code-owned SQL statement against the linked demo Supabase
 * project via the authenticated Supabase CLI (`supabase db query
 * --linked`). This never accepts caller-supplied SQL — every call site in
 * this module passes one of the two constants exported from
 * trusted-repair.ts, or a trivial literal readiness probe. Arguments are
 * always passed as an explicit array (no shell interpolation, shell:false).
 *
 * Before executing anything, this verifies (a) the project directory can
 * be located, and (b) the CLI's linked project matches the demo project
 * referenced by DEMO_SUPABASE_URL — refusing to run otherwise. This is the
 * hard safety boundary that prevents ever mutating a different linked
 * Supabase project (e.g. CoachFlow) from this server.
 */
async function runManagementSql(sql: string, timeoutMs: number = TIMEOUT_MS): Promise<RunSqlResult> {
  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    return { ok: false, error: "PROJECT_ROOT_NOT_FOUND", message: MESSAGES.PROJECT_ROOT_NOT_FOUND };
  }

  const linkedRef = readLinkedProjectRef(projectRoot);
  if (!linkedRef) {
    return { ok: false, error: "PROJECT_NOT_LINKED", message: MESSAGES.PROJECT_NOT_LINKED };
  }

  const expectedRef = extractProjectRefFromUrl(process.env.DEMO_SUPABASE_URL);
  if (expectedRef && linkedRef !== expectedRef) {
    return { ok: false, error: "PROJECT_LINK_MISMATCH", message: MESSAGES.PROJECT_LINK_MISMATCH };
  }

  const cliPath = resolveCliExecutable();

  try {
    const { stdout } = await execFileAsync(cliPath, ["db", "query", "--linked", sql], {
      cwd: projectRoot,
      timeout: timeoutMs,
      shell: false,
    });
    return { ok: true, stdout };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string; stderr?: string };

    if (err.code === "ENOENT") {
      return { ok: false, error: "CLI_UNAVAILABLE", message: MESSAGES.CLI_UNAVAILABLE };
    }
    if (err.killed || err.signal === "SIGTERM") {
      return { ok: false, error: "CLI_TIMEOUT", message: MESSAGES.CLI_TIMEOUT };
    }

    const rawDetail = `${err.message ?? ""} ${err.stderr ?? ""}`;
    console.error("[db-admin] Supabase CLI command failed:", sanitizeForLog(rawDetail));

    const detail = rawDetail.toLowerCase();
    if (/access token|not authenticated|unauthorized|supabase login|no active session/.test(detail)) {
      return { ok: false, error: "CLI_UNAUTHENTICATED", message: MESSAGES.CLI_UNAUTHENTICATED };
    }
    if (/project ref|supabase link|not linked/.test(detail)) {
      return { ok: false, error: "PROJECT_NOT_LINKED", message: MESSAGES.PROJECT_NOT_LINKED };
    }

    return { ok: false, error: "CLI_FAILED", message: MESSAGES.CLI_FAILED };
  }
}

/** Applies the one trusted repair (fixed SQL, never derived from a request). */
export async function applyTrustedRepair(): Promise<DbAdminOutcome> {
  const result = await runManagementSql(REPAIR_SQL);
  return result.ok ? { ok: true } : result;
}

/** Restores the original vulnerable demo policy (fixed SQL, never derived from a request), so the demo can be repeated. */
export async function resetVulnerableState(): Promise<DbAdminOutcome> {
  const result = await runManagementSql(RESET_SQL);
  return result.ok ? { ok: true } : result;
}

/**
 * Verifies, without mutating anything, that a subsequent apply/reset would
 * actually succeed: the CLI executable resolves, the project directory is
 * found, it's linked to exactly the configured demo project, and a live
 * round-trip query succeeds (proving both CLI auth and DB reachability).
 * Runs the exact same resolution path applyTrustedRepair/resetVulnerableState
 * use, so a passing preflight is a genuine predictor, not a separate check
 * that can drift from the real mutation path.
 */
export async function checkMutationReadiness(): Promise<DbAdminOutcome> {
  const result = await runManagementSql("select 1;", PREFLIGHT_TIMEOUT_MS);
  return result.ok ? { ok: true } : result;
}

export type CurrentPolicyOutcome =
  | { ok: true; expression: string | null }
  | { ok: false; error: DbAdminErrorCode; message: string };

/** Reads the live USING expression currently deployed for the known demo policy. Read-only, fixed query text — no caller input. */
export async function getCurrentPolicyExpression(): Promise<CurrentPolicyOutcome> {
  const [schema, table] = REPAIR_TARGET_TABLE.split(".");
  const sql = `select qual from pg_policies where schemaname = '${schema}' and tablename = '${table}' and policyname = '${REPAIR_TARGET_POLICY_NAME}';`;

  const result = await runManagementSql(sql);
  if (!result.ok) return result;

  try {
    const parsed = JSON.parse(result.stdout) as { rows?: Array<{ qual?: unknown }> };
    const qual = parsed.rows?.[0]?.qual;
    return { ok: true, expression: typeof qual === "string" ? qual : null };
  } catch {
    return { ok: false, error: "MALFORMED_RESPONSE", message: MESSAGES.MALFORMED_RESPONSE };
  }
}
