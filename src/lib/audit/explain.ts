import type { PolicyOperation } from "./parse-policy";

function describeUsingAccess(operation: PolicyOperation | null): string {
  switch (operation) {
    case "SELECT":
      return "read every tenant's rows";
    case "INSERT":
      return "insert rows on behalf of any tenant";
    case "UPDATE":
      return "update every tenant's rows";
    case "DELETE":
      return "delete every tenant's rows";
    case "ALL":
      return "read, insert, update, and delete every tenant's rows";
    default:
      return "access every tenant's rows for this operation";
  }
}

/** Explanation for a USING (true) allow-all clause. */
export function explainAllowAllUsing(operation: PolicyOperation | null, table: string | null): string {
  const access = describeUsingAccess(operation);
  const scope = table ? ` in \`${table}\`` : "";
  return `This policy's USING clause is the literal boolean true, so PostgreSQL treats it as satisfied for every row regardless of who is asking. Row Level Security is effectively disabled: any client holding this role can ${access}${scope}.`;
}

export function remediateAllowAllUsing(ownerColumnHint: string | null): string {
  const column = ownerColumnHint ?? "owner_id";
  return `Scope the expression to the requesting user instead, e.g. USING (auth.uid() = ${column}).`;
}

/** Explanation for a WITH CHECK (true) allow-all clause. */
export function explainAllowAllWithCheck(operation: PolicyOperation | null, table: string | null): string {
  const scope = table ? ` in \`${table}\`` : "";
  const verb = operation === "UPDATE" ? "update" : operation === "ALL" ? "insert or update" : "insert";
  return `This policy's WITH CHECK clause is the literal boolean true, so PostgreSQL accepts any new or modified row regardless of its values. Any client holding this role can ${verb} rows${scope} claiming ownership by any tenant — for example setting the owner column to someone else's id.`;
}

export function remediateAllowAllWithCheck(ownerColumnHint: string | null): string {
  const column = ownerColumnHint ?? "owner_id";
  return `Scope the expression to the requesting user instead, e.g. WITH CHECK (auth.uid() = ${column}).`;
}

function describeAnonAccess(operation: PolicyOperation | null): string {
  switch (operation) {
    case "SELECT":
      return "unauthenticated row disclosure — anyone can read every row without signing in";
    case "INSERT":
      return "unauthenticated row creation — anyone can insert rows without signing in";
    case "UPDATE":
      return "unauthenticated modification — anyone can modify every row without signing in";
    case "DELETE":
      return "unauthenticated deletion — anyone can delete every row without signing in";
    case "ALL":
      return "broad unauthenticated access — anyone can read, insert, update, and delete every row without signing in";
    default:
      return "unauthenticated access to this operation";
  }
}

/** Explanation for an allow-all clause exposed to anon/PUBLIC. */
export function explainAnonAllowAll(clause: "USING" | "WITH CHECK", operation: PolicyOperation | null, table: string | null): string {
  const scope = table ? ` on \`${table}\`` : "";
  const impact = describeAnonAccess(operation);
  return `This ${clause} clause is the literal boolean true and applies to unauthenticated (anon) or PUBLIC requests${scope}. Impact: ${impact}.`;
}

export function remediateAnonAllowAll(clause: "USING" | "WITH CHECK"): string {
  return clause === "USING"
    ? "Restrict the role to `authenticated` and scope the expression to the requesting user, or add an explicit, deliberately narrow condition if public read access is genuinely intended."
    : "Restrict the role to `authenticated` and scope the expression to the requesting user before allowing unauthenticated writes.";
}

export function explainDisabledWithPolicies(table: string, policyCount: number): string {
  const plural = policyCount === 1 ? "policy" : "policies";
  return `${table} has ${policyCount} RLS ${plural} defined, but Row Level Security was never enabled (or was disabled after being enabled). PostgreSQL does not enforce any policy on a table until RLS is enabled, so every policy on this table is currently dead code and all rows are readable and writable by any role with ordinary table grants. Policies are present in source but PostgreSQL will not enforce them while RLS is disabled.`;
}

export function remediateDisabledWithPolicies(table: string): string {
  return `Run ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`;
}

export function explainPublicTableRlsDisabled(table: string): string {
  return `Table is exposed through the Data API without Row Level Security. \`${table}\` exists in an exposed schema with Row Level Security disabled and no policies defined at all — every request with ordinary table grants (including Supabase's default Data API roles) can read and write every row.`;
}

export function remediatePublicTableRlsDisabled(table: string): string {
  return `Run ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; and add explicit policies scoping access to the requesting user or tenant. Until policies exist, RLS being enabled alone will deny all access, which is the safe default.`;
}

export function explainNeedsReview(clause: "USING" | "WITH CHECK", table: string | null): string {
  const scope = table ? ` on \`${table}\`` : "";
  return `This policy's ${clause} expression${scope} is not a recognised allow-all pattern, but this scanner cannot statically confirm it correctly restricts access to the requesting tenant.`;
}

export function remediateNeedsReview(): string {
  return "Review manually — confirm it compares a tenant/owner column to auth.uid() or an equivalent trusted identity, not a client-suppliable value.";
}

export function explainLoginOnly(clause: "USING" | "WITH CHECK", table: string | null): string {
  const scope = table ? ` on \`${table}\`` : "";
  return `This ${clause} expression${scope} confirms the requester is authenticated, but does not bind the current row to the requesting user or tenant. Authentication is confirmed, but the policy does not bind the current row to the requesting user or tenant — any logged-in user can access every row.`;
}

export function remediateLoginOnly(ownerColumnHint: string | null): string {
  const column = ownerColumnHint ?? "owner_id";
  return `Add a comparison to the requesting user's identity, e.g. USING (auth.uid() = ${column}), rather than only checking that a user is logged in.`;
}

export function explainNonNullOwnerOnly(clause: "USING" | "WITH CHECK", table: string | null, column: string): string {
  const scope = table ? ` on \`${table}\`` : "";
  return `This ${clause} expression${scope} only checks that \`${column}\` is not null. The row has an owner, but the policy does not prove that the requester is that owner — any requester holding this role can access rows regardless of who owns them.`;
}

export function remediateNonNullOwnerOnly(column: string): string {
  return `Compare \`${column}\` to the requester's identity, e.g. USING (${column} = auth.uid()), instead of only checking it is populated.`;
}

export function explainUserMetadataAuthorization(clause: "USING" | "WITH CHECK", table: string | null): string {
  const scope = table ? ` on \`${table}\`` : "";
  return `This ${clause} expression${scope} makes an access decision based on user-editable profile metadata (raw_user_meta_data / user_metadata). A signed-in user can typically edit their own metadata through the standard auth API, so it should not be trusted as the sole security boundary.`;
}

export function remediateUserMetadataAuthorization(): string {
  return "Base authorization on a server-controlled source instead — a dedicated roles/permissions table, or app_metadata (only settable by a service role), not user-editable profile metadata.";
}

export function explainPermissiveBroadening(table: string, narrowPolicyName: string, broadPolicyName: string): string {
  return `\`${table}\` has multiple permissive policies for overlapping roles and commands. Permissive policies combine through OR, so "${broadPolicyName}" being satisfied grants access regardless of whether "${narrowPolicyName}" (a narrower ownership check) is also satisfied — the broad policy silently overrides the narrow one's protection.`;
}

export function remediatePermissiveBroadening(broadPolicyName: string): string {
  return `Remove or narrow "${broadPolicyName}", or convert it to a RESTRICTIVE policy (which combines with AND, not OR) if it is meant to add an additional constraint rather than an alternative grant.`;
}

export function explainSecurityDefinerSearchPath(functionName: string): string {
  return `\`${functionName}()\` is declared SECURITY DEFINER (it runs with its owner's privileges) but does not set an explicit, safe search_path. Without one, the function resolves unqualified object names using the caller's search_path, so another role able to create objects earlier in that path can hijack the function into running attacker-controlled code with the owner's privileges.`;
}

export function remediateSecurityDefinerSearchPath(functionName: string): string {
  return `Add SET search_path = '' (or an explicit, fully-qualified schema list) to the CREATE FUNCTION statement for ${functionName}(), and schema-qualify every object it references.`;
}

export function explainSecurityDefinerView(viewName: string, referencedTables: string[]): string {
  const tables = referencedTables.length > 0 ? ` (referencing ${referencedTables.join(", ")})` : "";
  return `\`${viewName}\`${tables} does not explicitly opt into security_invoker, so on Postgres versions/configurations where views default to running with their owner's privileges, it may bypass Row Level Security on the tables it reads — returning rows the querying user's own policies would have denied. Whether this is actually exploitable depends on grants and the Postgres version, which this scanner cannot fully confirm from migrations alone.`;
}

export function remediateSecurityDefinerView(viewName: string): string {
  return `Add WITH (security_invoker = true) to the CREATE VIEW statement for ${viewName}, so it runs with the querying user's own privileges and RLS policies.`;
}
