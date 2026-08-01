import { isSameRepository, type ParsedRepository } from "../github/parse-repository-url";
import {
  REPAIR_SQL,
  REPAIR_TARGET_OWNER_COLUMN,
  REPAIR_TARGET_POLICY_NAME,
  REPAIR_TARGET_TABLE,
  TRUSTED_REPAIR_EXPRESSION,
} from "./trusted-repair";

/**
 * Opens a real pull request on the authorised demo repository containing the
 * one trusted repair.
 *
 * This is the only part of the product that writes to a repository, so it
 * carries the same discipline as db-admin.ts does for the database:
 *
 *   - The committed SQL is the fixed REPAIR_SQL constant from
 *     trusted-repair.ts. Nothing derived from a request body or a model
 *     response is ever written into the file.
 *   - The target repository must be exactly DEMO_GITHUB_REPOSITORY. A
 *     mismatch refuses before any network call is made.
 *   - The token is sent in the Authorization header only, and never appears
 *     in a URL, a request body, a log line, or a returned message.
 *
 * Reaching this function is itself the human-approval step: the UI only
 * offers the button after a person has approved the proposal.
 */

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15_000;

export type OpenPullRequestErrorCode =
  | "TOKEN_MISSING"
  | "REPOSITORY_NOT_AUTHORISED"
  | "SERVER_MISCONFIGURED"
  | "GITHUB_TOKEN_INVALID"
  | "GITHUB_FORBIDDEN"
  | "GITHUB_FAILED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "MALFORMED_RESPONSE";

export type OpenPullRequestOutcome =
  | { ok: true; pullRequestUrl: string; branch: string; filePath: string }
  | { ok: false; error: OpenPullRequestErrorCode; message: string };

const MESSAGES: Record<OpenPullRequestErrorCode, string> = {
  TOKEN_MISSING:
    "No GitHub token is configured on the server, so this demo cannot open a pull request. Everything else in the repair flow is unaffected.",
  REPOSITORY_NOT_AUTHORISED:
    "This action is only available for the configured demonstration repository.",
  SERVER_MISCONFIGURED: "The server is not configured with a demonstration repository.",
  GITHUB_TOKEN_INVALID:
    "GitHub rejected the token itself as invalid. It may be expired or revoked — or this deployment may still be running an older value, since changing an environment variable does not affect a deployment until it is rebuilt.",
  GITHUB_FORBIDDEN:
    "GitHub accepted the token but refused the action. It is missing write access to the demonstration repository — Contents and Pull requests both need write permission.",
  GITHUB_FAILED: "GitHub rejected the request. No pull request was opened.",
  TIMEOUT: "Timed out talking to GitHub. No pull request was opened.",
  NETWORK_ERROR: "Could not reach GitHub. No pull request was opened.",
  MALFORMED_RESPONSE: "GitHub returned a response this app could not read.",
};

type GithubResult = { ok: true; data: unknown } | { ok: false; error: OpenPullRequestErrorCode; message: string };

/**
 * One GitHub REST call. The token is attached here and nowhere else, so
 * there is a single place to audit. Response bodies are never returned to
 * the caller verbatim: GitHub echoes request context in some error
 * messages, and a returned message ends up on screen.
 */
async function githubRequest(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<GithubResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      method: init?.method ?? "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    });

    // 401 and 403 need different fixes, so they get different codes. 401 is
    // "this token is not valid" — expired, revoked, or a deployment still
    // running a stale value. 403 is "this token is valid but may not do
    // that" — a scope problem. Collapsing them makes the fault
    // undiagnosable from the response alone.
    if (response.status === 401) {
      return { ok: false, error: "GITHUB_TOKEN_INVALID", message: MESSAGES.GITHUB_TOKEN_INVALID };
    }
    if (response.status === 403) {
      return { ok: false, error: "GITHUB_FORBIDDEN", message: MESSAGES.GITHUB_FORBIDDEN };
    }
    if (!response.ok) {
      return { ok: false, error: "GITHUB_FAILED", message: MESSAGES.GITHUB_FAILED };
    }

    try {
      return { ok: true, data: await response.json() };
    } catch {
      return { ok: false, error: "MALFORMED_RESPONSE", message: MESSAGES.MALFORMED_RESPONSE };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "TIMEOUT", message: MESSAGES.TIMEOUT };
    }
    return { ok: false, error: "NETWORK_ERROR", message: MESSAGES.NETWORK_ERROR };
  } finally {
    clearTimeout(timeout);
  }
}

function readString(data: unknown, key: string): string | null {
  if (typeof data !== "object" || data === null) return null;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

/** The migration file committed by the pull request. Header explains the change to a human reader. */
function migrationContent(): string {
  return `-- Fix: restrict ${REPAIR_TARGET_TABLE} to the trainer who owns each row.
--
-- Found by RLS Red Alert and confirmed against a live database: the policy
-- "${REPAIR_TARGET_POLICY_NAME}" used USING (true), so every authenticated
-- trainer could read every other trainer's clients.
--
-- This replaces it with an ownership check against ${REPAIR_TARGET_OWNER_COLUMN},
-- so a trainer sees their own rows and nothing else.

${REPAIR_SQL}
`;
}

/** The pull request body. Plain English first, SQL second — the reader may not be an engineer. */
function pullRequestBody(): string {
  return `## What was wrong

The policy \`${REPAIR_TARGET_POLICY_NAME}\` on \`${REPAIR_TARGET_TABLE}\` allowed **any signed-in trainer to read every other trainer's clients**, including names, email addresses and private notes.

The rule said \`USING (true)\`, which means "always allow". Row Level Security was switched on, so the project looks protected from the dashboard, but the rule itself never checked who was asking.

## How we know

This was not inferred from reading the SQL alone. We signed in as a real test trainer against the demonstration database and ran the same query the application runs. It returned rows belonging to a different trainer.

## The fix

\`\`\`sql
using (${TRUSTED_REPAIR_EXPRESSION})
\`\`\`

\`auth.uid()\` is the ID of whoever is making the request. Comparing it against \`${REPAIR_TARGET_OWNER_COLUMN}\` means each trainer sees their own rows and nothing else. After applying it, the identical query returns zero rows belonging to anyone else.

## Before merging

Check that \`${REPAIR_TARGET_OWNER_COLUMN}\` is set on every existing row. Any row where it is null will stop being visible, which is the correct behaviour but may be surprising.

---

Opened by RLS Red Alert after a human approved this specific change. The SQL above is a fixed, reviewed statement — it was not generated by a model.`;
}

export async function openTrustedRepairPullRequest(
  repository: ParsedRepository,
  options: { stamp: string },
): Promise<OpenPullRequestOutcome> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { ok: false, error: "TOKEN_MISSING", message: MESSAGES.TOKEN_MISSING };
  }

  const demoRepository = process.env.DEMO_GITHUB_REPOSITORY;
  if (!demoRepository) {
    return { ok: false, error: "SERVER_MISCONFIGURED", message: MESSAGES.SERVER_MISCONFIGURED };
  }

  // Checked before any network call: this function holds a write-capable
  // token, so the authorised-repository check is the boundary that keeps it
  // pointed at the one repository it is allowed to touch.
  if (!isSameRepository(repository, demoRepository)) {
    return { ok: false, error: "REPOSITORY_NOT_AUTHORISED", message: MESSAGES.REPOSITORY_NOT_AUTHORISED };
  }

  const { owner, repo } = repository;
  const base = `/repos/${owner}/${repo}`;
  const branch = `rls-red-alert/fix-clients-rls-${options.stamp}`;
  const filePath = `supabase/migrations/${options.stamp}_fix_clients_rls_policy.sql`;

  const repoInfo = await githubRequest(token, base);
  if (!repoInfo.ok) return repoInfo;

  const defaultBranch = readString(repoInfo.data, "default_branch");
  if (!defaultBranch) {
    return { ok: false, error: "MALFORMED_RESPONSE", message: MESSAGES.MALFORMED_RESPONSE };
  }

  const ref = await githubRequest(token, `${base}/git/ref/heads/${defaultBranch}`);
  if (!ref.ok) return ref;

  const object =
    typeof ref.data === "object" && ref.data !== null ? (ref.data as { object?: unknown }).object : null;
  const baseSha = readString(object, "sha");
  if (!baseSha) {
    return { ok: false, error: "MALFORMED_RESPONSE", message: MESSAGES.MALFORMED_RESPONSE };
  }

  const created = await githubRequest(token, `${base}/git/refs`, {
    method: "POST",
    body: { ref: `refs/heads/${branch}`, sha: baseSha },
  });
  if (!created.ok) return created;

  const committed = await githubRequest(token, `${base}/contents/${filePath}`, {
    method: "PUT",
    body: {
      message: `fix: restrict ${REPAIR_TARGET_TABLE} to the owning trainer`,
      content: Buffer.from(migrationContent(), "utf-8").toString("base64"),
      branch,
    },
  });
  if (!committed.ok) return committed;

  const pull = await githubRequest(token, `${base}/pulls`, {
    method: "POST",
    body: {
      title: `Fix: restrict ${REPAIR_TARGET_TABLE} to the owning trainer`,
      head: branch,
      base: defaultBranch,
      body: pullRequestBody(),
    },
  });
  if (!pull.ok) return pull;

  const pullRequestUrl = readString(pull.data, "html_url");
  if (!pullRequestUrl) {
    return { ok: false, error: "MALFORMED_RESPONSE", message: MESSAGES.MALFORMED_RESPONSE };
  }

  return { ok: true, pullRequestUrl, branch, filePath };
}
