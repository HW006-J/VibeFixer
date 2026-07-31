import { describe, expect, it } from "vitest";
import {
  classifyRoleExposure,
  classifyUserMetadataAuthorization,
  isLoginOnlyExpression,
  isNonNullOwnerOnlyExpression,
} from "./policy-patterns";

describe("classifyRoleExposure", () => {
  it("treats an omitted TO clause as public-exposed", () => {
    expect(classifyRoleExposure([])).toBe("public_exposed");
  });

  it("treats an explicit anon role as public-exposed", () => {
    expect(classifyRoleExposure(["anon"])).toBe("public_exposed");
  });

  it("treats an explicit public role as public-exposed", () => {
    expect(classifyRoleExposure(["public"])).toBe("public_exposed");
  });

  it("treats anon combined with other roles as still public-exposed", () => {
    expect(classifyRoleExposure(["authenticated", "anon"])).toBe("public_exposed");
  });

  it("treats an authenticated-only role as restricted", () => {
    expect(classifyRoleExposure(["authenticated"])).toBe("restricted");
  });

  it("treats a custom application role as restricted", () => {
    expect(classifyRoleExposure(["service_role"])).toBe("restricted");
  });
});

describe("isLoginOnlyExpression", () => {
  it("matches auth.uid() is not null", () => {
    expect(isLoginOnlyExpression("auth.uid() is not null")).toBe(true);
  });

  it("matches with extra whitespace and case differences", () => {
    expect(isLoginOnlyExpression("  AUTH.UID()   IS NOT NULL  ")).toBe(true);
  });

  it("matches the (select auth.uid()) is not null form", () => {
    expect(isLoginOnlyExpression("(select auth.uid()) is not null")).toBe(true);
  });

  it("matches the auth.role() = 'authenticated' form", () => {
    expect(isLoginOnlyExpression("auth.role() = 'authenticated'")).toBe(true);
  });

  it("does not match when combined with a real ownership boundary", () => {
    expect(isLoginOnlyExpression("auth.uid() is not null and auth.uid() = owner_id")).toBe(false);
  });

  it("does not match an unrelated expression", () => {
    expect(isLoginOnlyExpression("status = 'active'")).toBe(false);
  });

  it("does not match a genuine ownership comparison", () => {
    expect(isLoginOnlyExpression("auth.uid() = trainer_id")).toBe(false);
  });
});

describe("isNonNullOwnerOnlyExpression", () => {
  it("matches a bare owner-column not-null check", () => {
    expect(isNonNullOwnerOnlyExpression("trainer_id is not null")).toEqual({ matches: true, column: "trainer_id" });
  });

  it("matches other common owner/tenant column names", () => {
    expect(isNonNullOwnerOnlyExpression("owner_id is not null").matches).toBe(true);
    expect(isNonNullOwnerOnlyExpression("user_id is not null").matches).toBe(true);
    expect(isNonNullOwnerOnlyExpression("tenant_id is not null").matches).toBe(true);
  });

  it("does not match auth.uid() is not null (that is the login-only pattern, not this one)", () => {
    expect(isNonNullOwnerOnlyExpression("auth.uid() is not null").matches).toBe(false);
  });

  it("does not match a genuine ownership comparison", () => {
    expect(isNonNullOwnerOnlyExpression("trainer_id = auth.uid()").matches).toBe(false);
  });

  it("does not match a compound expression", () => {
    expect(isNonNullOwnerOnlyExpression("trainer_id is not null and status = 'active'").matches).toBe(false);
  });
});

describe("classifyUserMetadataAuthorization", () => {
  it("flags a direct raw_user_meta_data comparison as high confidence", () => {
    expect(
      classifyUserMetadataAuthorization("(auth.jwt() -> 'raw_user_meta_data' ->> 'role') = 'admin'"),
    ).toEqual({ matches: true, confidence: "high" });
  });

  it("flags a user_metadata comparison as high confidence", () => {
    expect(classifyUserMetadataAuthorization("(auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean")).toMatchObject(
      { matches: true },
    );
  });

  it("downgrades to medium confidence when combined with other AND/OR logic", () => {
    expect(
      classifyUserMetadataAuthorization("auth.uid() = owner_id and (raw_user_meta_data ->> 'role') = 'admin'"),
    ).toEqual({ matches: true, confidence: "medium" });
  });

  it("does not flag a bare auth.jwt() call with no metadata access", () => {
    expect(classifyUserMetadataAuthorization("auth.jwt() is not null")).toEqual({ matches: false, confidence: null });
  });

  it("does not flag trusted app_metadata", () => {
    expect(classifyUserMetadataAuthorization("(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'")).toEqual({
      matches: false,
      confidence: null,
    });
  });

  it("does not flag a mention of user_metadata with no comparison context", () => {
    expect(classifyUserMetadataAuthorization("user_metadata_backup_table_id")).toEqual({
      matches: false,
      confidence: null,
    });
  });
});
