import { describe, expect, it } from "vitest";
import { parseIamPolicyFile } from "./parse-iam";
import { runIamChecks } from "./run-iam-checks";

const WILDCARD_ACTION = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowAll",
    "Effect": "Allow",
    "Action": "*",
    "Resource": "arn:aws:s3:::my-bucket/*"
  }]
}`;

const WILDCARD_RESOURCE = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:GetObject",
    "Resource": "*"
  }]
}`;

const PUBLIC_PRINCIPAL = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "sts:AssumeRole"
  }]
}`;

const CONSTRAINED = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::123456789012:root" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "partner-1" } }
  }]
}`;

const CROSS_ACCOUNT = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::999888777666:role/partner" },
    "Action": "sts:AssumeRole"
  }]
}`;

const SAFE_SCOPED = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject"],
    "Resource": "arn:aws:s3:::logs-bucket/app/*"
  }]
}`;

const MALFORMED = `{ "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", `;

function file(path: string, content: string) {
  return { path, content };
}

describe("IAM parser and rules", () => {
  it("flags Allow with Action *", () => {
    const findings = runIamChecks([file("iam/wide.json", WILDCARD_ACTION)]);
    expect(findings.some((f) => f.ruleId === "IAM_ALLOW_WILDCARD_ACTION")).toBe(true);
  });

  it("flags Allow with Resource *", () => {
    const findings = runIamChecks([file("policies/s3-read.json", WILDCARD_RESOURCE)]);
    expect(findings.some((f) => f.ruleId === "IAM_ALLOW_WILDCARD_RESOURCE")).toBe(true);
  });

  it("flags trust policy with Principal *", () => {
    const findings = runIamChecks([file("iam/trust-policy.json", PUBLIC_PRINCIPAL)]);
    expect(findings.some((f) => f.ruleId === "IAM_TRUST_PUBLIC_PRINCIPAL")).toBe(true);
  });

  it("does not flag constrained principal with conditions", () => {
    const findings = runIamChecks([file("iam/trust-policy.json", CONSTRAINED)]);
    expect(findings.some((f) => f.ruleId === "IAM_TRUST_PUBLIC_PRINCIPAL")).toBe(false);
  });

  it("flags cross-account trust references", () => {
    const findings = runIamChecks([file("iam/trust-policy.json", CROSS_ACCOUNT)]);
    expect(findings.some((f) => f.ruleId === "IAM_CROSS_ACCOUNT_TRUST")).toBe(true);
  });

  it("accepts safe scoped IAM policy without critical findings", () => {
    const findings = runIamChecks([file("iam/app-policy.json", SAFE_SCOPED)]);
    expect(findings.filter((f) => f.severity === "critical")).toHaveLength(0);
  });

  it("emits needs review for malformed IAM JSON", () => {
    const findings = runIamChecks([file("iam/broken-policy.json", MALFORMED)]);
    expect(findings.some((f) => f.ruleId === "IAM_MALFORMED_DOCUMENT")).toBe(true);
  });

  it("preserves statement index and Sid in parse output", () => {
    const parsed = parseIamPolicyFile(file("iam/wide.json", WILDCARD_ACTION));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.statements[0].sid).toBe("AllowAll");
      expect(parsed.statements[0].index).toBe(0);
    }
  });
});
