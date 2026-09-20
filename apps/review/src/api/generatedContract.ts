import {
  validateReviewMutationDocument,
  validateReviewRequestDocument,
  validateReviewResponseDocument,
  validateReviewSnapshotDocument,
} from "./generatedValidators.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | Array<JsonValue>
  | { [key: string]: JsonValue };

type ProducerIdentity =
  | { kind: "agent"; name: string; model: string; harness: string }
  | { kind: "human" | "application" | "script"; name: string };

type Provenance = {
  producer: ProducerIdentity;
  createdAt: string;
};

type GitHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
};

type CodeLanguage =
  | "python"
  | "bash"
  | "javascript"
  | "typescript"
  | "json"
  | "yaml"
  | "toml"
  | "markdown"
  | "plaintext";

export type EvidenceReference =
  | {
      id: string;
      kind: "gitDiff";
      gitDiff: {
        repositoryPath: string;
        baseRevision: string;
        targetRevision: string | null;
        path: string;
        contextLines: number;
        hunk: GitHunk;
        patchSha256: string;
      };
    }
  | {
      id: string;
      kind: "code";
      code: { path: string; language: CodeLanguage; sourceSha256: string };
    }
  | {
      id: string;
      kind: "text";
      text: {
        path: string;
        mediaType: string;
        startLine: number;
        endLine: number;
        sourceSha256: string;
      };
    }
  | {
      id: string;
      kind: "json";
      json: { path: string; pointers: Array<string>; sourceSha256: string };
    }
  | {
      id: string;
      kind: "artifact";
      artifact: { path: string; mediaType: string; byteLength: number; sha256: string };
    };

export type EvidenceCitation =
  | { kind: "lineRange"; startLine: number; endLine: number }
  | { kind: "jsonPointer"; pointer: string };

export type EvidenceRelation = {
  id: string;
  subjectKind: "claim" | "option" | "factor";
  subjectId: string;
  evidenceId: string;
  role: "supports" | "challenges" | "qualifies" | "informs";
  citations: Array<EvidenceCitation>;
};

export type CompletionClaim = { id: string; text: string };

export type ChoiceOption = {
  id: string;
  label: string;
  description: string;
  artifactEvidenceId: string | null;
};

type ChoiceFactor = { id: string; label: string; description: string };

type ChoiceTradeoff = {
  optionId: string;
  factorId: string;
  value: string;
  tone: "support" | "risk" | "tradeoff" | "neutral";
};

export type ReviewRequest =
  | {
      version: 1;
      id: string;
      type: "completion";
      title: string;
      requestedDecision: string;
      evidence: Array<EvidenceReference>;
      relations: Array<EvidenceRelation>;
      provenance: Provenance;
      completion: { claims: Array<CompletionClaim> };
    }
  | {
      version: 1;
      id: string;
      type: "choice";
      title: string;
      requestedDecision: string;
      evidence: Array<EvidenceReference>;
      relations: Array<EvidenceRelation>;
      provenance: Provenance;
      choice: {
        presentation: "matrix" | "artifacts";
        expectedResponse: "selection" | "approval";
        options: Array<ChoiceOption>;
        factors: Array<ChoiceFactor>;
        tradeoffs: Array<ChoiceTradeoff>;
        recommendation: { optionId: string; rationale: string } | null;
      };
    };

type AssessmentProducer = { model: string; harness: string };

export type ExternalAssessment = {
  version: 1;
  id: string;
  requestId: string;
  claimId: string;
  assessment: "supported" | "contradicted" | "unproven" | "qualified";
  rationale: string;
  caveat: string | null;
  producer: AssessmentProducer;
  createdAt: string;
};

type UnresolvedItem = {
  subjectKind: "request" | "claim" | "option" | "factor";
  subjectId: string;
  reason: string;
};

export type NormalizedPoint = { x: number; y: number };

type NormalizedPath = {
  color: string;
  width: number;
  points: Array<NormalizedPoint>;
};

export type ArtifactAnnotation = {
  id: string;
  artifactEvidenceId: string;
  artifactSha256: string;
  paths: Array<NormalizedPath>;
};

export type CompletionDecision = {
  claimId: string;
  decision: "accepted" | "qualified" | "rejected" | "needsEvidence";
  rationale: string;
  qualification: string | null;
};

type ChoiceResponse = {
  outcome: "selected" | "rejected" | "qualified" | "changesRequested";
  optionIds: Array<string>;
  conditions: Array<string>;
  selectedArtifactEvidenceIds: Array<string>;
};

type ReviewResponseBase = {
  version: 1;
  id: string;
  requestId: string;
  requestSha256: string;
  status: "draft" | "final";
  rationale: string;
  unresolved: Array<UnresolvedItem>;
  annotations: Array<ArtifactAnnotation>;
  provenance: Provenance;
};

export type ReviewResponse =
  | (ReviewResponseBase & {
      type: "completion";
      completion: { decisions: Array<CompletionDecision> };
    })
  | (ReviewResponseBase & { type: "choice"; choice: ChoiceResponse });

export type StructuredError = {
  code: string;
  message: string;
  field: string | null;
  requestId: string | null;
  evidenceId: string | null;
};

export type ResolvedEvidenceContent =
  | { kind: "gitDiff"; unifiedDiff: string; truncated: boolean }
  | { kind: "code"; code: string; language: CodeLanguage }
  | { kind: "text"; text: string; startLine: number; endLine: number; truncated: boolean }
  | { kind: "json"; json: JsonValue }
  | { kind: "artifact"; route: string; mediaType: string; byteLength: number; sha256: string };

export type ResolvedEvidence =
  | { evidenceId: string; status: "resolved"; content: ResolvedEvidenceContent; error: null }
  | { evidenceId: string; status: "failed"; content: null; error: StructuredError };

type ProjectManifest = {
  version: 1;
  id: string;
  name: string;
  requests: Array<string>;
};

export type RequestSnapshot = {
  path: string;
  sha256: string;
  request: ReviewRequest;
  assessments: Array<ExternalAssessment>;
  response: ReviewResponse | null;
  evidence: Array<ResolvedEvidence>;
};

export type ReviewSnapshot = {
  version: 1;
  project: ProjectManifest;
  revision: number;
  requests: Array<RequestSnapshot>;
};

type ReviewOperation =
  | { op: "importAssessment"; assessment: ExternalAssessment }
  | { op: "setResponse"; response: ReviewResponse }
  | { op: "deleteResponse"; requestId: string };

export type ReviewMutation = {
  projectId: string;
  expectedRevision: number;
  operations: Array<ReviewOperation>;
};

type ContinuationPacket = {
  version: 1;
  projectId: string;
  request: ReviewRequest;
  requestSha256: string;
  response: ReviewResponse;
  evidence: Array<ResolvedEvidence>;
};

type ExportDocument = {
  version: 1;
  projectId: string;
  revision: number;
  responses: Array<ReviewResponse>;
  continuations: Array<ContinuationPacket>;
};

export type MutationResult = { version: 1; snapshot: ReviewSnapshot };
export type ExportResult = { version: 1; export: ExportDocument };

export function validateReviewRequest(value: unknown): value is ReviewRequest {
  return validateReviewRequestDocument(value);
}

export function validateReviewResponse(value: unknown): value is ReviewResponse {
  return validateReviewResponseDocument(value);
}

export function validateReviewSnapshot(value: unknown): value is ReviewSnapshot {
  return validateReviewSnapshotDocument(value);
}

export function validateReviewMutation(value: unknown): value is ReviewMutation {
  return validateReviewMutationDocument(value);
}
