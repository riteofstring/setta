import type {
  ArtifactAnnotation,
  CompletionDecision,
  RequestSnapshot,
  ReviewRequest,
  ReviewResponse,
} from "../backend/generatedContract";

export type CompletionDecisionKind = CompletionDecision["decision"];

export function findRequestSnapshot(
  requests: readonly RequestSnapshot[],
  requestId: string,
): RequestSnapshot {
  const request = requests.find(
    (candidate) => candidate.request.id === requestId,
  );
  if (!request) {
    throw new Error(`Review request ${requestId} is unavailable.`);
  }
  return request;
}

function responseId(requestId: string): string {
  return `response:${requestId}`;
}

function humanProvenance() {
  return {
    createdAt: new Date().toISOString(),
    producer: { kind: "human" as const, name: "Local reviewer" },
  };
}

export function completionResponse(
  snapshot: RequestSnapshot,
  decision: CompletionDecision,
): ReviewResponse {
  const request = completionRequest(snapshot);
  const decisions = mergeCompletionDecision(snapshot, decision);
  const decided = new Set(decisions.map((candidate) => candidate.claimId));
  const unresolved = request.completion.claims
    .filter((claim) => !decided.has(claim.id))
    .map((claim) => ({
      reason: "No human decision recorded.",
      subjectId: claim.id,
      subjectKind: "claim" as const,
    }));
  const preserved = preservedResponseFields(snapshot);
  return {
    annotations: preserved.annotations,
    completion: { decisions },
    id: preserved.id,
    provenance: humanProvenance(),
    rationale: preserved.rationale,
    requestId: request.id,
    requestSha256: snapshot.sha256,
    status: completionStatus(unresolved.length),
    type: "completion",
    unresolved,
    version: 1,
  };
}

function completionRequest(snapshot: RequestSnapshot) {
  if (snapshot.request.type !== "completion") {
    throw new Error("A completion decision requires a completion request.");
  }
  return snapshot.request;
}

function mergeCompletionDecision(
  snapshot: RequestSnapshot,
  decision: CompletionDecision,
): CompletionDecision[] {
  const existing =
    snapshot.response?.type === "completion"
      ? snapshot.response.completion.decisions
      : [];
  return [
    ...existing.filter((candidate) => candidate.claimId !== decision.claimId),
    decision,
  ];
}

function preservedResponseFields(snapshot: RequestSnapshot) {
  const response = snapshot.response;
  if (!response) {
    return {
      annotations: [],
      id: responseId(snapshot.request.id),
      rationale: "",
    };
  }
  return {
    annotations: response.annotations,
    id: response.id,
    rationale: response.rationale,
  };
}

function completionStatus(unresolvedCount: number): "draft" | "final" {
  return unresolvedCount === 0 ? "final" : "draft";
}

function selectedArtifacts(
  request: Extract<ReviewRequest, { type: "choice" }>,
  optionIds: readonly string[],
): string[] {
  return request.choice.options.flatMap((option) =>
    optionIds.includes(option.id) && option.artifactEvidenceId
      ? [option.artifactEvidenceId]
      : [],
  );
}

export function selectedChoiceResponse(
  snapshot: RequestSnapshot,
  optionIds: readonly string[],
  rationale: string,
  conditions: readonly string[] = [],
): ReviewResponse {
  if (snapshot.request.type !== "choice" || optionIds.length === 0) {
    throw new Error("A confirmed choice requires at least one option.");
  }
  const outcome = conditions.length > 0 ? "qualified" : "selected";
  return {
    annotations: snapshot.response?.annotations ?? [],
    choice: {
      conditions: [...conditions],
      optionIds: [...optionIds],
      outcome,
      selectedArtifactEvidenceIds: selectedArtifacts(
        snapshot.request,
        optionIds,
      ),
    },
    id: snapshot.response?.id ?? responseId(snapshot.request.id),
    provenance: humanProvenance(),
    rationale,
    requestId: snapshot.request.id,
    requestSha256: snapshot.sha256,
    status: "final",
    type: "choice",
    unresolved: [],
    version: 1,
  };
}

export function changesRequestedResponse(
  snapshot: RequestSnapshot,
  rationale: string,
  annotations: readonly ArtifactAnnotation[],
): ReviewResponse {
  if (snapshot.request.type !== "choice") {
    throw new Error("A revision request requires a choice request.");
  }
  if (rationale.trim() === "" && annotations.length === 0) {
    throw new Error("Describe or draw the requested change.");
  }
  return {
    annotations: [...annotations],
    choice: {
      conditions: [],
      optionIds: [],
      outcome: "changesRequested",
      selectedArtifactEvidenceIds: [],
    },
    id: snapshot.response?.id ?? responseId(snapshot.request.id),
    provenance: humanProvenance(),
    rationale: rationale.trim(),
    requestId: snapshot.request.id,
    requestSha256: snapshot.sha256,
    status: "final",
    type: "choice",
    unresolved: [],
    version: 1,
  };
}

export function decisionForClaim(
  snapshot: RequestSnapshot,
  claimId: string,
): CompletionDecision | null {
  if (snapshot.response?.type !== "completion") {
    return null;
  }
  return (
    snapshot.response.completion.decisions.find(
      (decision) => decision.claimId === claimId,
    ) ?? null
  );
}
