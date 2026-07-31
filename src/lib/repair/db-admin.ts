import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  REPAIR_SQL,
  REPAIR_TARGET_POLICY_NAME,
  REPAIR_TARGET_TABLE,
  RESET_SQL,
} from "./trusted-repair";

const execFileAsync = promisify(execFile);

export type DbAdminErrorCode = "CLI_UNAVAILABLE" | "CLI_TIMEOUT" | "CLI_FAILED" | "MALFORMED_RESPONSE";

export type DbAdminOutcome = { ok: true } | { ok: false; error: DbAdminErrorCode; message: string };

const TIMEOUT_MS = 25_000;

/**
 * Runs one fixed, code-owned SQL statement against the linked demo Supabase
 * project via the authenticated Supabase CLI (`supabase db query --linked`)
 * — the same mechanism `scripts/setup-demo-environment.mjs` already uses.
 * This never accepts caller-supplied SQL; every call site in this module
 * passes one of the two constants exported from `trusted-repair.ts`.
 *
 * This only works when run on a machine with the Supabase CLI installed,
 * already authenticated, and linked to the demo project (`supabase link`)
 * — true for this local hackathon demo, not a real hosted deployment.
 */
async function runManagementSql(sql: string): Promise<{ ok: true; stdout: string } | { ok: false; error: DbAdminErrorCode; message: string }> {
  try {
    const { stdout } = await execFileAsync("supabase", ["db", "query", "--linked", sql], {
      timeout: TIMEOUT_MS,
    });
    return { ok: true, stdout };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
    if (err.code === "ENOENT") {
      return {
        ok: false,
        error: "CLI_UNAVAILABLE",
        message: "The Supabase CLI is not available on this server, so the database change could not be applied.",
      };
    }
    if (err.killed || err.signal === "SIGTERM") {
      return { ok: false, error: "CLI_TIMEOUT", message: "Timed out applying the database change." };
    }
    return {
      ok: false,
      error: "CLI_FAILED",
      message: "Applying the database change failed. Confirm the Supabase CLI is authenticated and linked to the demo project.",
    };
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
    return { ok: false, error: "MALFORMED_RESPONSE", message: "Could not read the current live policy state." };
  }
}
