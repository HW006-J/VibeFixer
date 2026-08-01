import { describe, expect, it } from "vitest";
import { explainAllowAllUsing, remediateAllowAllUsing } from "./explain";

/**
 * The report and the live demo have to describe the same event. The
 * scanner finds "USING (true)"; what the audience sees is a stranger's
 * record appearing after editing a number in the URL. If the finding never
 * names that consequence, the viewer has to make the connection alone —
 * and a non-technical reader will not.
 */
describe("explainAllowAllUsing — naming the consequence, not just the clause", () => {
  const explanation = explainAllowAllUsing("SELECT", "public.clients");

  it("still states the mechanical cause", () => {
    expect(explanation).toMatch(/literal boolean true/i);
  });

  it("names it as broken access control", () => {
    expect(explanation).toMatch(/broken access control/i);
  });

  it("cites the OWASP category rather than leaving it implied", () => {
    expect(explanation).toMatch(/A01:2021/);
  });

  it("describes the symptom in terms of looking a record up by id", () => {
    // This is what the audience actually watches happen.
    expect(explanation).toMatch(/\bid\b/i);
  });

  it("does not claim the leak was observed — the static rule cannot know that", () => {
    expect(explanation).not.toMatch(/we confirmed|was confirmed|proven live|verified live/i);
  });

  it("still works without a table name", () => {
    const anonymous = explainAllowAllUsing("SELECT", null);
    expect(anonymous).toMatch(/broken access control/i);
    expect(anonymous).not.toMatch(/undefined|null/);
  });

  it("leaves the remediation pointing at the owner column", () => {
    expect(remediateAllowAllUsing("trainer_id")).toMatch(/auth\.uid\(\) = trainer_id/);
  });
});
