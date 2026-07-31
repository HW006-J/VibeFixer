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
  return `This policy's USING clause is the literal boolean true, so PostgreSQL treats it as satisfied for every row regardless of who is asking. Row Level Security is effectively disabled: any client holding this role can ${access}${scope}. Scope the expression to the requesting user instead, e.g. USING (auth.uid() = owner_id).`;
}

/** Explanation for a WITH CHECK (true) allow-all clause. */
export function explainAllowAllWithCheck(operation: PolicyOperation | null, table: string | null): string {
  const scope = table ? ` in \`${table}\`` : "";
  const verb = operation === "UPDATE" ? "update" : operation === "ALL" ? "insert or update" : "insert";
  return `This policy's WITH CHECK clause is the literal boolean true, so PostgreSQL accepts any new or modified row regardless of its values. Any client holding this role can ${verb} rows${scope} claiming ownership by any tenant — for example setting the owner column to someone else's id. Scope the expression to the requesting user instead, e.g. WITH CHECK (auth.uid() = owner_id).`;
}

export function explainDisabledWithPolicies(table: string, policyCount: number): string {
  const plural = policyCount === 1 ? "policy" : "policies";
  return `${table} has ${policyCount} RLS ${plural} defined, but Row Level Security was never enabled (or was disabled after being enabled) with ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY. PostgreSQL does not enforce any policy on a table until RLS is enabled, so every policy on this table is currently dead code and all rows are readable and writable by any role with ordinary table grants.`;
}

export function explainNeedsReview(clause: "USING" | "WITH CHECK", table: string | null): string {
  const scope = table ? ` on \`${table}\`` : "";
  return `This policy's ${clause} expression${scope} is not a recognised allow-all pattern, but this scanner cannot statically confirm it correctly restricts access to the requesting tenant. Review it manually — confirm it compares a tenant/owner column to auth.uid() or an equivalent trusted identity, not a client-suppliable value.`;
}
