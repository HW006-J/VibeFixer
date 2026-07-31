export type RlsFinding = {
  id: string;
  ruleId: "RLS_ALLOW_ALL";
  severity: "critical";
  title: string;
  repository: string;
  filePath: string;
  line: number;
  table: string | null;
  operation: string | null;
  role: string | null;
  evidence: string;
  explanation: string;
};

export type ScannedFile = {
  path: string;
  content: string;
};
