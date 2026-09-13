export interface StructuredErrorV1 {
  code: string;
  message: string;
}

interface CommandV1 {
  argv: string[];
  workingDirectory: string;
}

interface CandidateOriginV1 {
  application: "python-canvas";
  projectId: string;
  projectRevision: number;
  callableId: string;
  deepLink: string;
}

export interface CandidateV1 {
  id: string;
  name: string;
  command: CommandV1;
  origin: CandidateOriginV1 | null;
}

interface CaseSetV1 {
  id: string;
  name: string;
  manifest: string;
}

type CheckKindV1 = "artifact_max_bytes" | "image_dimensions";

export interface CheckV1 {
  id: string;
  name: string;
  kind: CheckKindV1;
  artifactName: string;
  maximumBytes: number | null;
  width: number | null;
  height: number | null;
}

interface EvaluatorV1 {
  id: string;
  name: string;
  checks: CheckV1[];
}

interface ExecutionPolicyV1 {
  concurrency: number;
  timeoutMilliseconds: number;
}

interface SectionLayoutV1 {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface ViewportV1 {
  x: number;
  y: number;
  zoom: number;
}

interface PresentationV1 {
  sections: Record<string, SectionLayoutV1>;
  viewport: ViewportV1;
}

export interface ProjectV1 {
  version: 1;
  id: string;
  revision: number;
  name: string;
  caseSet: CaseSetV1;
  candidates: CandidateV1[];
  evaluator: EvaluatorV1 | null;
  execution: ExecutionPolicyV1;
  presentation: PresentationV1;
}

export interface ProjectDraftV1 {
  name: string;
  caseSet: CaseSetV1;
  candidates: CandidateV1[];
  evaluator: EvaluatorV1 | null;
  execution: ExecutionPolicyV1;
  presentation: PresentationV1;
}

export interface ReplaceProjectRequestV1 {
  projectId: string;
  expectedRevision: number;
  project: ProjectDraftV1;
}

export interface ImportCandidateRequestV1 {
  projectId: string;
  expectedRevision: number;
  bundleDirectory: string;
}

interface CaseV1 {
  id: string;
  name: string;
  input: unknown;
  expected: unknown | null;
}

export interface LaunchRequestV1 {
  projectId: string;
  expectedRevision: number;
  candidateIds: string[];
}

interface LaunchResponseV1 {
  launchId: string;
  runIds: string[];
}

interface LaunchV1 {
  version: 1;
  id: string;
  projectId: string;
  projectRevision: number;
  createdAt: string;
  caseSet: CaseSetV1;
  cases: CaseV1[];
  candidates: CandidateV1[];
  evaluator: EvaluatorV1 | null;
  execution: ExecutionPolicyV1;
  runIds: string[];
  rerunParentRunId: string | null;
}

export interface ArtifactReferenceV1 {
  id: string;
  name: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
}

type ObservationKindV1 = "number" | "text" | "boolean";

export interface ObservationV1 {
  id: string;
  name: string;
  kind: ObservationKindV1;
  numberValue: number | null;
  textValue: string | null;
  booleanValue: boolean | null;
}

type FindingStatusV1 = "passed" | "failed";

export interface FindingV1 {
  checkId: string;
  checkName: string;
  status: FindingStatusV1;
  message: string;
}

type CaseStatusV1 = "queued" | "running" | "succeeded" | "failed" | "canceled" | "timed_out" | "interrupted";

export interface CaseResultV1 {
  caseId: string;
  caseName: string;
  status: CaseStatusV1;
  progress: number;
  message: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMilliseconds: number | null;
  output: unknown | null;
  observations: ObservationV1[];
  findings: FindingV1[];
  artifacts: ArtifactReferenceV1[];
  stderr: string;
  stderrTruncated: boolean;
  error: StructuredErrorV1 | null;
}

type RunStatusV1 = "queued" | "running" | "completed" | "failed" | "canceled" | "interrupted";

export interface RunV1 {
  version: 1;
  id: string;
  launchId: string;
  candidateId: string;
  candidateName: string;
  status: RunStatusV1;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  caseResults: CaseResultV1[];
  rerunParentId: string | null;
  error: StructuredErrorV1 | null;
}

export interface ReviewV1 {
  version: 1;
  leftRunId: string;
  rightRunId: string;
  preferredRunId: string | null;
  note: string;
  updatedAt: string;
}

export interface PutReviewRequestV1 {
  leftRunId: string;
  rightRunId: string;
  preferredRunId: string | null;
  note: string;
}

interface ValidationIssueV1 {
  code: string;
  message: string;
  path: string;
}

interface ProjectValidationV1 {
  ready: boolean;
  caseCount: number;
  executionCount: number;
  issues: ValidationIssueV1[];
}

export interface ApplicationSnapshotV1 {
  version: "bench-snapshot/v1";
  project: ProjectV1;
  cases: CaseV1[];
  validation: ProjectValidationV1;
  launches: LaunchV1[];
  runs: RunV1[];
  reviews: ReviewV1[];
  diagnostics: StructuredErrorV1[];
}
