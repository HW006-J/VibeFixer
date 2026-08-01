import { afterEach, describe, expect, it, vi } from "vitest";
import { runAudit } from "./run-audit";
import type { ScannedFile } from "../scanner/types";

const REPOSITORY = "some-owner/some-repo";

function file(path: string, lines: string[]): ScannedFile {
  return { path, content: lines.join("\n") };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runAudit", () => {
  it("produces a coverage report and passes isDemoRepository through untouched", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const files: ScannedFile[] = [
      file("supabase/migrations/0001.sql", [
        "create table public.clients (id uuid primary key);",
        "alter table public.clients enable row level security;",
        'create policy "read_own" on public.clients for select to authenticated using (auth.uid() = trainer_id);',
        'create policy "leaky" on public.clients for select to public using (true);',
      ]),
    ];

    const report = await runAudit(REPOSITORY, true, files);

    expect(report.repository).toBe(REPOSITORY);
    expect(report.isDemoRepository).toBe(true);
    expect(report.coverage.filesScanned).toEqual(["supabase/migrations/0001.sql"]);
    expect(report.coverage.policiesInspected).toBe(2);
    expect(report.coverage.tablesDiscovered).toBe(1);
    expect(report.coverage.criticalFindingCount).toBe(1);
    expect(report.coverage.highRiskFindingCount).toBe(0);
    expect(report.coverage.needsReviewCount).toBe(0);
    expect(report.coverage.noIssueFoundCount).toBe(1);
    expect(report.coverage.aiReviewsPerformed).toBe(0);
    expect(report.findings).toHaveLength(1);
    // "to public" defaults role exposure to PUBLIC, so this is the more
    // specific anon/public-exposed classification, not the generic one.
    expect(report.findings[0].ruleId).toBe("VIBE_ANON_ALLOW_ALL");
    expect(report.findings[0].liveValidationAvailable).toBe(true);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("does not attempt AI review when no API key is configured, and never fabricates an aiReview", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const files: ScannedFile[] = [
      file("supabase/migrations/0001.sql", [
        "alter table public.t enable row level security;",
        'create policy "p" on public.t for select to authenticated using (some_custom_fn(id));',
      ]),
    ];

    const report = await runAudit(REPOSITORY, false, files);

    const reviewFinding = report.findings.find((f) => f.ruleId === "RLS_POLICY_NEEDS_REVIEW");
    expect(reviewFinding).toBeDefined();
    expect(reviewFinding?.aiReview).toBeNull();
    expect(report.coverage.aiReviewsPerformed).toBe(0);
  });

  it("returns an empty findings list and zero-valued coverage for a repository with no policies", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const report = await runAudit(REPOSITORY, false, []);

    expect(report.findings).toHaveLength(0);
    expect(report.coverage.filesScanned).toHaveLength(0);
    expect(report.coverage.policiesInspected).toBe(0);
    expect(report.coverage.criticalFindingCount).toBe(0);
    expect(report.coverage.needsReviewCount).toBe(0);
  });

  it("surfaces security-definer function and view findings end to end, without live validation available for them", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const files: ScannedFile[] = [
      file("supabase/migrations/0001.sql", [
        "create table public.clients (id uuid primary key);",
        "alter table public.clients enable row level security;",
        'create policy "read_own" on public.clients for select to authenticated using (auth.uid() = trainer_id);',
        "create function public.leak() returns setof public.clients language sql security definer as $$ select * from public.clients; $$;",
        "create view public.client_view as select id from public.clients;",
      ]),
    ];

    // isDemoRepository: true, but live validation only ever exercises
    // public.clients directly — never a function or a view.
    const report = await runAudit(REPOSITORY, true, files);

    const fnFinding = report.findings.find((f) => f.ruleId === "VIBE_SECURITY_DEFINER_SEARCH_PATH");
    expect(fnFinding).toBeDefined();
    expect(fnFinding?.liveValidationAvailable).toBe(false);

    const viewFinding = report.findings.find((f) => f.ruleId === "VIBE_SECURITY_DEFINER_VIEW");
    expect(viewFinding).toBeDefined();
    expect(viewFinding?.tier).toBe("high");
    expect(viewFinding?.liveValidationAvailable).toBe(false);
  });
});

describe("runAudit — non-SQL families", () => {
  it("reports Firebase rules findings alongside SQL findings", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const files: ScannedFile[] = [
      file("supabase/migrations/0001.sql", [
        "create table public.clients (id uuid primary key);",
        "alter table public.clients enable row level security;",
        'create policy "leaky" on public.clients for select to public using (true);',
      ]),
      file("firebase.rules", ["{", '  "rules": {', '    ".read": true', "  }", "}"]),
    ];

    const report = await runAudit(REPOSITORY, true, files);

    const firebase = report.findings.filter((f) => f.ruleId === "VIBE_FIREBASE_PUBLIC_RULE");
    expect(firebase).toHaveLength(1);
    expect(firebase[0].filePath).toBe("firebase.rules");

    // The SQL pipeline must be unaffected by the presence of other families.
    expect(report.findings.some((f) => f.ruleId === "VIBE_ANON_ALLOW_ALL" || f.ruleId === "RLS_ALLOW_ALL")).toBe(true);
  });

  it("never marks a non-SQL finding as live-verifiable, even on the demo repository", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const files: ScannedFile[] = [file("firebase.rules", ['{ "rules": { ".write": true } }'])];

    const report = await runAudit(REPOSITORY, true, files);

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].liveValidationAvailable).toBe(false);
  });

  it("does not count a non-SQL file as an inspected SQL statement", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const files: ScannedFile[] = [file("firebase.rules", ['{ "rules": { ".read": true } }'])];

    const report = await runAudit(REPOSITORY, true, files);

    expect(report.coverage.statementsInspected).toBe(0);
    expect(report.coverage.policiesInspected).toBe(0);
  });
});
