import { isGeminiConfigured } from "../ai/gemini-client";
import { checkMutationReadiness } from "../repair/db-admin";
import { readDemoSupabaseConfig } from "../supabase/live-validate";

export type DeploymentCapabilities = {
  /** Public GitHub repository scanning — plain HTTPS to the GitHub API. Always true. */
  staticScan: boolean;
  /** Live authenticated query against the demo Supabase project — plain HTTPS, works anywhere DEMO_SUPABASE_* is configured. */
  liveValidation: boolean;
  /** Real Gemini repair-proposal analysis — plain HTTPS, works anywhere GEMINI_API_KEY is configured. */
  geminiAnalysis: boolean;
  /** Applying the trusted repair policy — requires the authenticated local Supabase CLI and a linked project directory. */
  databaseMutation: boolean;
  /** Resetting the demo back to its vulnerable state — the same CLI mechanism as databaseMutation. */
  demoReset: boolean;
  /**
   * Opening a pull request with the trusted repair — plain HTTPS to the
   * GitHub API, so unlike databaseMutation it works anywhere GITHUB_TOKEN
   * is configured, Vercel included.
   */
  pullRequest: boolean;
  /** Set only when databaseMutation/demoReset are false, explaining exactly why. Null when everything checked is available. */
  reason: string | null;
};

/**
 * Detects what this specific running deployment can actually do, from real
 * server-side signals — never assumed. staticScan/liveValidation/
 * geminiAnalysis all work over plain HTTPS and are identical on localhost
 * and Vercel; only databaseMutation/demoReset depend on the authenticated
 * local Supabase CLI and a filesystem-linked project directory, which is
 * genuine and supported on localhost but structurally impossible on
 * Vercel's serverless functions (no persistent CLI session, no CLI binary
 * installed, no linked project on disk between invocations).
 *
 * `process.env.VERCEL` is a standard, non-secret platform variable Vercel
 * sets on every deployment (preview and production alike) — checking it
 * first gives a fast, certain "no" without a pointless CLI round trip that
 * is guaranteed to fail there. Everywhere else, the real
 * checkMutationReadiness() probe still runs, so a genuinely broken local
 * CLI setup is reported honestly rather than assumed to work just because
 * the host isn't Vercel.
 */
export async function detectDeploymentCapabilities(): Promise<DeploymentCapabilities> {
  const liveValidation = readDemoSupabaseConfig() !== null;
  const geminiAnalysis = isGeminiConfigured();
  // Plain HTTPS to the GitHub API — no CLI, no linked project directory,
  // so this is available wherever a token is configured.
  const pullRequest = Boolean(process.env.GITHUB_TOKEN);

  if (process.env.VERCEL === "1") {
    return {
      staticScan: true,
      liveValidation,
      geminiAnalysis,
      databaseMutation: false,
      demoReset: false,
      pullRequest,
      reason:
        "Policy apply and demo reset require the authenticated local Supabase CLI and a linked project directory, which are not available in this serverless deployment. Run this app locally to use the full repair/reset workflow.",
    };
  }

  const mutationReadiness = await checkMutationReadiness();
  if (mutationReadiness.ok) {
    return {
      staticScan: true,
      liveValidation,
      geminiAnalysis,
      databaseMutation: true,
      demoReset: true,
      pullRequest,
      reason: null,
    };
  }

  return {
    staticScan: true,
    liveValidation,
    geminiAnalysis,
    databaseMutation: false,
    demoReset: false,
    pullRequest,
    reason: mutationReadiness.message,
  };
}
