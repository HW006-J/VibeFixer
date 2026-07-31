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
    expect(report.coverage.needsReviewCount).toBe(0);
    expect(report.coverage.noIssueFoundCount).toBe(1);
    expect(report.coverage.aiReviewsPerformed).toBe(0);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].ruleId).toBe("RLS_ALLOW_ALL");
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
});
