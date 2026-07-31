import { splitSqlStatements } from "./discover-statements";
import { parsePolicyStatement, type ParsedPolicy } from "./parse-policy";
import { lineNumberAt } from "./source-location";
import type { ScannedFile } from "../scanner/types";

export type RlsChange = {
  enabled: boolean;
  filePath: string;
  line: number;
};

export type TableInventoryEntry = {
  table: string;
  /** The most recent ENABLE/DISABLE ROW LEVEL SECURITY statement seen for this table, in file-then-source order. Postgres defaults RLS to disabled, so a table that is never mentioned is `false`. */
  rlsEnabled: boolean;
  createdAt: { filePath: string; line: number } | null;
  rlsChanges: RlsChange[];
  policies: ParsedPolicy[];
};

export type SchemaInventory = {
  tables: Map<string, TableInventoryEntry>;
  /** Every CREATE/ALTER/DROP POLICY and CREATE/ALTER TABLE statement classified across all scanned files. */
  statementsInspected: number;
  policiesInspected: number;
};

const CREATE_TABLE_NAME_RE = /^create\s+table\s+(?:if\s+not\s+exists\s+)?"?([A-Za-z0-9_."]+)"?/i;
const ALTER_TABLE_NAME_RE = /^alter\s+table\s+(?:only\s+)?"?([A-Za-z0-9_."]+)"?/i;
const DROP_POLICY_TABLE_RE = /^drop\s+policy\s+(?:if\s+exists\s+)?(?:"[^"]*"|[A-Za-z0-9_]+)\s+on\s+"?([A-Za-z0-9_."]+)"?/i;

function normaliseTableName(name: string): string {
  return name.replace(/"/g, "").trim().toLowerCase();
}

function getOrCreateTable(tables: Map<string, TableInventoryEntry>, rawName: string): TableInventoryEntry {
  const key = normaliseTableName(rawName);
  let entry = tables.get(key);
  if (!entry) {
    entry = { table: rawName.replace(/"/g, ""), rlsEnabled: false, createdAt: null, rlsChanges: [], policies: [] };
    tables.set(key, entry);
  }
  return entry;
}

/**
 * Builds a per-table inventory of RLS status and policies from every
 * permitted SQL file, processing files and statements in order so that
 * later ENABLE/DISABLE ROW LEVEL SECURITY statements correctly override
 * earlier ones for the same table (last-wins, matching how Postgres
 * actually applies migrations in sequence).
 */
export function buildSchemaInventory(files: ScannedFile[]): SchemaInventory {
  const tables = new Map<string, TableInventoryEntry>();
  let statementsInspected = 0;
  let policiesInspected = 0;

  for (const file of files) {
    const statements = splitSqlStatements(file.content);

    for (const statement of statements) {
      if (statement.type === "OTHER") continue;
      statementsInspected += 1;

      const line = lineNumberAt(file.content, statement.startIndex);

      switch (statement.type) {
        case "CREATE_TABLE": {
          const match = CREATE_TABLE_NAME_RE.exec(statement.raw);
          if (!match) break;
          const entry = getOrCreateTable(tables, match[1]);
          if (!entry.createdAt) {
            entry.createdAt = { filePath: file.path, line };
          }
          break;
        }
        case "ALTER_TABLE_ENABLE_RLS":
        case "ALTER_TABLE_DISABLE_RLS": {
          const match = ALTER_TABLE_NAME_RE.exec(statement.raw);
          if (!match) break;
          const entry = getOrCreateTable(tables, match[1]);
          const enabled = statement.type === "ALTER_TABLE_ENABLE_RLS";
          entry.rlsEnabled = enabled;
          entry.rlsChanges.push({ enabled, filePath: file.path, line });
          break;
        }
        case "CREATE_POLICY": {
          policiesInspected += 1;
          const policy = parsePolicyStatement(statement, file.content, file.path);
          if (policy.table) {
            getOrCreateTable(tables, policy.table).policies.push(policy);
          }
          break;
        }
        case "DROP_POLICY": {
          const match = DROP_POLICY_TABLE_RE.exec(statement.raw);
          if (!match) break;
          // Ensure the table is represented in the inventory even if this
          // is the only statement mentioning it; does not remove earlier
          // CREATE POLICY findings, since migrations are additive history
          // and a later DROP does not change what shipped earlier.
          getOrCreateTable(tables, match[1]);
          break;
        }
        case "ALTER_POLICY":
          // Structural detection only (statement is still counted above);
          // altering a policy's USING/WITH CHECK is not parsed separately
          // in this milestone.
          break;
      }
    }
  }

  return { tables, statementsInspected, policiesInspected };
}
