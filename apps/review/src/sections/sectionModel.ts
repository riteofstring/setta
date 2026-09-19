import type { WorkspaceSection } from "@setta/workspace";

import type {
  EvidenceReference,
  RequestSnapshot,
  ResolvedEvidence,
} from "../backend/generatedContract";

function dataRecord(section: WorkspaceSection): Record<string, unknown> {
  if (
    section.data === null ||
    typeof section.data !== "object" ||
    Array.isArray(section.data)
  ) {
    throw new Error(`Review section ${section.id} has invalid data.`);
  }
  return section.data;
}

export function sectionRequestId(section: WorkspaceSection): string {
  const requestId = dataRecord(section).requestId;
  if (typeof requestId !== "string" || requestId === "") {
    throw new Error(`Review section ${section.id} has no request id.`);
  }
  return requestId;
}

export function sectionEvidenceId(section: WorkspaceSection): string {
  const evidenceId = dataRecord(section).evidenceId;
  if (typeof evidenceId !== "string" || evidenceId === "") {
    throw new Error(`Review section ${section.id} has no evidence id.`);
  }
  return evidenceId;
}

export function evidenceReference(
  snapshot: RequestSnapshot,
  evidenceId: string,
): EvidenceReference {
  const reference = snapshot.request.evidence.find(
    (candidate) => candidate.id === evidenceId,
  );
  if (!reference) {
    throw new Error(`Evidence ${evidenceId} is unavailable.`);
  }
  return reference;
}

export function resolvedEvidence(
  snapshot: RequestSnapshot,
  evidenceId: string,
): ResolvedEvidence {
  const resolved = snapshot.evidence.find(
    (candidate) => candidate.evidenceId === evidenceId,
  );
  if (!resolved) {
    throw new Error(`Resolved evidence ${evidenceId} is unavailable.`);
  }
  return resolved;
}
