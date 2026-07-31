import type { TableInventoryEntry } from "./build-inventory";
import {
  explainSecurityDefinerSearchPath,
  explainSecurityDefinerView,
  remediateSecurityDefinerSearchPath,
  remediateSecurityDefinerView,
} from "./explain";
import { makeFinding } from "./make-finding";
import type { ParsedFunction } from "./parse-function";
import type { ParsedView } from "./parse-view";
import type { AuditFinding } from "./types";

/**
 * Evaluates every SECURITY DEFINER function for VIBE_SECURITY_DEFINER_SEARCH_PATH.
 * A SECURITY DEFINER function with no explicit search_path (or one whose
 * search_path includes a mutable schema like "public") is a well-known,
 * source-confirmable Postgres risk independent of grants — the function
 * itself resolves unqualified names using the caller's search_path,
 * regardless of who is allowed to call it. Functions whose name could not
 * be parsed are reported as needs_review rather than a confirmed finding,
 * since the affected object can't be precisely identified.
 */
export function evaluateSecurityDefinerFunctions(functions: ParsedFunction[], repository: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const fn of functions) {
    if (!fn.securityDefiner) continue;
    if (fn.hasSafeExplicitSearchPath) continue;

    const uncertain = fn.name === null;
    const label = fn.name ?? "this function";

    findings.push(
      makeFinding({
        id: `VIBE_SECURITY_DEFINER_SEARCH_PATH-${fn.filePath}-${fn.line}`,
        ruleId: "VIBE_SECURITY_DEFINER_SEARCH_PATH",
        tier: uncertain ? "review" : "high",
        confidence: uncertain ? "low" : "high",
        title: fn.name
          ? `"${fn.name}" is SECURITY DEFINER without a safe search_path`
          : "A SECURITY DEFINER function has no safe search_path",
        repository,
        filePath: fn.filePath,
        line: fn.line,
        endLine: fn.endLine,
        table: null,
        objectType: "function",
        evidence: fn.evidence,
        explanation: explainSecurityDefinerSearchPath(label),
        remediation: remediateSecurityDefinerSearchPath(label),
        assumptions: uncertain
          ? "Could not confidently parse this function's name from the CREATE FUNCTION statement, so the affected object cannot be precisely identified — review manually."
          : fn.hasAnyExplicitSearchPath
            ? "The function does set an explicit search_path, but its value appears to include a mutable/writable schema (e.g. public), which does not fully close the risk."
            : null,
      }),
    );
  }

  return findings;
}

function normaliseTableRef(name: string): string {
  return name.replace(/"/g, "").trim().toLowerCase();
}

/**
 * Evaluates every CREATE VIEW for VIBE_SECURITY_DEFINER_VIEW. Since this
 * scanner does not parse GRANT/REVOKE statements, real-world exploitability
 * always depends on grants this scanner cannot verify — so this only ever
 * reaches "high" (not "critical"), and only when the view demonstrably
 * references a table that has RLS enabled (i.e. there is a real protection
 * to potentially bypass) and does not opt into security_invoker. Views
 * whose referenced tables couldn't be confidently determined, or that
 * don't reference any RLS-enabled table, are reported as needs_review.
 */
export function evaluateSecurityDefinerViews(
  views: ParsedView[],
  tables: Map<string, TableInventoryEntry>,
  repository: string,
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const view of views) {
    if (view.securityInvoker) continue;

    const rlsProtectedReferences = view.referencedTables.filter((ref) => {
      const table = tables.get(normaliseTableRef(ref));
      return table?.rlsEnabled === true;
    });

    const clearBypassRisk = rlsProtectedReferences.length > 0;

    findings.push(
      makeFinding({
        id: `VIBE_SECURITY_DEFINER_VIEW-${view.filePath}-${view.line}`,
        ruleId: "VIBE_SECURITY_DEFINER_VIEW",
        tier: clearBypassRisk ? "high" : "review",
        confidence: clearBypassRisk ? "high" : "low",
        title: view.name ? `"${view.name}" may bypass Row Level Security` : "A view may bypass Row Level Security",
        repository,
        filePath: view.filePath,
        line: view.line,
        endLine: view.endLine,
        table: null,
        objectType: "view",
        evidence: view.evidence,
        explanation: explainSecurityDefinerView(view.name ?? "this view", rlsProtectedReferences),
        remediation: remediateSecurityDefinerView(view.name ?? "this view"),
        assumptions: clearBypassRisk
          ? "Whether this is actually exploitable also depends on grants (whether anon/authenticated can query this view at all) and the Postgres version's view-privilege default, neither of which this scanner parses from migrations."
          : "Could not confirm this view references a table with RLS enabled (either no table reference was reliably parsed, or none of its referenced tables have RLS enabled), so the bypass risk is unclear — review manually.",
      }),
    );
  }

  return findings;
}
