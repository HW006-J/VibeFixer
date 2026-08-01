import { describe, expect, it } from "vitest";
import { analyzeFirebaseRules } from "./firebase-rules";

const REPO = "some-owner/some-repo";

function analyze(content: string) {
  return analyzeFirebaseRules({ path: "firebase.rules", content }, REPO);
}

describe("analyzeFirebaseRules — world-readable and world-writable rules", () => {
  it("flags a literal true .read at the root as critical", () => {
    const findings = analyze(`{
  "rules": {
    ".read": true,
    ".write": false
  }
}`);

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("VIBE_FIREBASE_PUBLIC_RULE");
    expect(findings[0].tier).toBe("critical");
    expect(findings[0].line).toBe(3);
  });

  it("flags a literal true .write at the root as critical", () => {
    const findings = analyze(`{
  "rules": {
    ".write": true
  }
}`);

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("VIBE_FIREBASE_PUBLIC_RULE");
  });

  it("reports the JSON path of a nested public rule", () => {
    const findings = analyze(`{
  "rules": {
    "push_tokens": {
      ".read": true
    }
  }
}`);

    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toContain("rules/push_tokens");
  });

  it("never marks a finding as live-verifiable", () => {
    const findings = analyze(`{ "rules": { ".read": true } }`);

    expect(findings[0].liveValidationAvailable).toBe(false);
  });

  it("emits nothing for correctly scoped rules", () => {
    const findings = analyze(`{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth.uid === $uid",
        ".write": "auth.uid === $uid"
      }
    }
  }
}`);

    expect(findings).toEqual([]);
  });

  it("emits nothing rather than guessing when the file is not valid JSON", () => {
    expect(analyze("this is not json at all {{{")).toEqual([]);
  });
});

/**
 * The Firebase mirror of VIBE_LOGIN_ONLY_POLICY: being signed in is not the
 * same as being allowed. A rule under a $uid-scoped path that only checks
 * that someone is authenticated lets every signed-in user reach every other
 * user's node.
 */
describe("analyzeFirebaseRules — authenticated is not authorized", () => {
  const underUidPath = (condition: string) => `{
  "rules": {
    "push_tokens": {
      "$uid": {
        ".write": ${JSON.stringify(condition)}
      }
    }
  }
}`;

  it("flags a $uid-scoped rule that only checks auth !== null", () => {
    const findings = analyze(underUidPath("auth !== null"));

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("VIBE_FIREBASE_AUTH_ONLY_RULE");
    expect(findings[0].tier).toBe("high");
    expect(findings[0].evidence).toContain("rules/push_tokens/$uid");
  });

  it("flags the != and auth.uid != null spellings too", () => {
    expect(analyze(underUidPath("auth != null"))).toHaveLength(1);
    expect(analyze(underUidPath("auth.uid !== null"))).toHaveLength(1);
  });

  it("accepts a rule that compares auth.uid against the path variable", () => {
    expect(analyze(underUidPath("auth.uid === $uid"))).toEqual([]);
  });

  it("accepts a rule that checks sign-in and ownership together", () => {
    expect(analyze(underUidPath("auth !== null && auth.uid === $uid"))).toEqual([]);
  });

  it("does not flag an auth check on a path with no variable to compare against", () => {
    // Nothing scopes this node to a particular user, so "must be signed in"
    // may well be the intended rule. Flagging it would be a false positive.
    const findings = analyze(`{
  "rules": {
    "announcements": {
      ".read": "auth !== null"
    }
  }
}`);

    expect(findings).toEqual([]);
  });
});
