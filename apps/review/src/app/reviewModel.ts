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

export function responseId(requestId: string): string {
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
  if (snapshot.request.type !== "completion") {
    throw new Error("A completion decision requires a completion request.");
  }
  const existing =
    snapshot.response?.type === "completion"
      ? snapshot.response.completion.decisions
      : [];
  const decisions = [
    ...existing.filter((candidate) => candidate.claimId !== decision.claimId),
    decision,
  ];
  const decided = new Set(decisions.map((candidate) => candidate.claimId));
  const unresolved = snapshot.request.completion.claims
    .filter((claim) => !decided.has(claim.id))
    .map((claim) => ({
      reason: "No human decision recorded.",
      subjectId: claim.id,
      subjectKind: "claim" as const,
    }));
  return {
    annotations: snapshot.response?.annotations ?? [],
    completion: { decisions },
    id: snapshot.response?.id ?? responseId(snapshot.request.id),
    provenance: humanProvenance(),
    rationale: snapshot.response?.rationale ?? "",
    requestId: snapshot.request.id,
    requestSha256: snapshot.sha256,
    status: unresolved.length === 0 ? "final" : "draft",
    type: "completion",
    unresolved,
    version: 1,
  };
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
