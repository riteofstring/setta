import type {
  WorkspaceDocument,
  WorkspaceDocumentInput,
  WorkspaceGraphEdge,
  WorkspaceGraphPort,
  WorkspaceSectionInput,
} from "@setta/workspace";

import type {
  EvidenceReference,
  RequestSnapshot,
  ReviewSnapshot,
} from "../backend/generatedContract";
import type { ReviewSubjectSelection } from "./reviewContext";

export const REVIEW_CLAIMS_SECTION_KIND = "review.claims";
export const REVIEW_CHOICE_SECTION_KIND = "review.choice";
export const REVIEW_ARTIFACT_CHOICE_SECTION_KIND = "review.artifact-choice";
export const REVIEW_EVIDENCE_SECTION_KIND = "review.evidence";
export const REVIEW_ARTIFACT_SECTION_KIND = "review.artifact";

const REQUEST_X = 64;
const LANE_GAP = 160;
const EVIDENCE_GAP = 40;

function encoded(...parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join(":");
}

export function requestSectionId(requestId: string): string {
  return encoded("review", "request", requestId);
}

export function evidenceSectionId(
  requestId: string,
  evidenceId: string,
): string {
  return encoded("review", "evidence", requestId, evidenceId);
}

function relationPortId(relationId: string, end: "source" | "target"): string {
  return encoded("review", "relation", relationId, end);
}

function relationEdgeId(requestId: string, relationId: string): string {
  return encoded("review", "edge", requestId, relationId);
}

function sectionData(
  requestId: string,
  evidenceId?: string,
): Record<string, string> {
  return evidenceId ? { evidenceId, requestId } : { requestId };
}

function evidencePath(reference: EvidenceReference): string {
  switch (reference.kind) {
    case "gitDiff":
      return reference.gitDiff.path;
    case "text":
      return reference.text.path;
    case "json":
      return reference.json.path;
    case "artifact":
      return reference.artifact.path;
  }
}

function basename(path: string): string {
  const segments = path.split("/");
  return segments.at(-1) || path;
}

function evidenceTitle(
  request: RequestSnapshot,
  reference: EvidenceReference,
): string {
  if (request.request.type === "choice") {
    const option = request.request.choice.options.find(
      (candidate) => candidate.artifactEvidenceId === reference.id,
    );
    if (option) {
      return option.label;
    }
  }
  return basename(evidencePath(reference));
}

type ReviewSectionDefinition = Readonly<{
  data: Record<string, string>;
  id: string;
  kind: string;
  name: string;
  size: { width: number; height: number | "auto" };
  tagColor: string | null;
}>;

function makeSection({
  data,
  id,
  kind,
  name,
  size,
  tagColor,
}: ReviewSectionDefinition): WorkspaceSectionInput {
  return {
    children: [],
    data,
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind,
    name,
    overflowMode: false,
    positionAndSizeLocked: false,
    size,
    styleColor: null,
    tagColor,
  };
}

function requestKind(request: RequestSnapshot): string {
  if (request.request.type === "completion") {
    return REVIEW_CLAIMS_SECTION_KIND;
  }
  return request.request.choice.presentation === "artifacts"
    ? REVIEW_ARTIFACT_CHOICE_SECTION_KIND
    : REVIEW_CHOICE_SECTION_KIND;
}

function requestSize(request: RequestSnapshot): {
  width: number;
  height: number | "auto";
} {
  if (request.request.type === "completion") {
    return { height: "auto", width: 560 };
  }
  if (request.request.choice.presentation === "artifacts") {
    return { height: "auto", width: 440 };
  }
  const width = Math.min(
    1_040,
    Math.max(620, 290 + request.request.choice.factors.length * 160),
  );
  const height = Math.min(
    480,
    Math.max(288, 176 + request.request.choice.options.length * 56),
  );
  return { height, width };
}

function requestTagColor(request: RequestSnapshot): string {
  if (request.response?.status === "final") {
    return "#4ade80";
  }
  if (request.response?.status === "draft") {
    return "#f2bc66";
  }
  return "#6680ad";
}

function evidenceSize(reference: EvidenceReference): {
  width: number;
  height: number;
} {
  switch (reference.kind) {
    case "gitDiff":
      return { height: 420, width: 620 };
    case "artifact":
      return { height: 470, width: 430 };
    default:
      return { height: 360, width: 480 };
  }
}

function preserveLocalPresentation(
  section: WorkspaceSectionInput,
  current: WorkspaceDocument | undefined,
): WorkspaceSectionInput {
  const previous = current?.sections[section.id];
  if (!previous || previous.kind !== section.kind) {
    return section;
  }
  return {
    ...section,
    isMinimized: previous.isMinimized,
    size: previous.size,
  };
}

function placeEvidence(
  request: RequestSnapshot,
  reference: EvidenceReference,
  requestWidth: number,
  laneY: number,
  evidenceIndex: number,
): { x: number; y: number } {
  if (
    request.request.type === "choice" &&
    request.request.choice.presentation === "artifacts"
  ) {
    return {
      x: REQUEST_X + requestWidth + 120 + evidenceIndex * 470,
      y: laneY,
    };
  }
  const column = evidenceIndex % 2;
  const row = Math.floor(evidenceIndex / 2);
  return {
    x: REQUEST_X + requestWidth + 140 + column * 660,
    y: laneY + row * 400,
  };
}

function laneHeight(request: RequestSnapshot): number {
  const evidenceCount = request.request.evidence.length;
  if (
    request.request.type === "choice" &&
    request.request.choice.presentation === "artifacts"
  ) {
    return 540;
  }
  const requestHeight =
    request.request.type === "completion"
      ? 190 + request.request.completion.claims.length * 48
      : 220 + request.request.choice.options.length * 74;
  return Math.max(requestHeight, Math.ceil(evidenceCount / 2) * 400);
}

export function projectReviewDocument(
  snapshot: ReviewSnapshot,
  current?: WorkspaceDocument,
): WorkspaceDocumentInput {
  const sections: WorkspaceDocumentInput["sections"] = {};
  const topLevelSections: WorkspaceDocumentInput["topLevelSections"] = {};
  let laneY = 64;
  let zIndex = 0;

  for (const request of snapshot.requests) {
    const controlId = requestSectionId(request.request.id);
    const controlSize = requestSize(request);
    sections[controlId] = preserveLocalPresentation(
      makeSection({
        data: sectionData(request.request.id),
        id: controlId,
        kind: requestKind(request),
        name: request.request.title,
        size: controlSize,
        tagColor: requestTagColor(request),
      }),
      current,
    );
    const previousControl = current?.topLevelSections[controlId];
    topLevelSections[controlId] = previousControl ?? {
      h: controlSize.height === "auto" ? null : controlSize.height,
      w: controlSize.width,
      x: REQUEST_X,
      y: laneY,
      zIndex: zIndex++,
    };

    request.request.evidence.forEach((reference, evidenceIndex) => {
      const evidenceId = evidenceSectionId(request.request.id, reference.id);
      const resolved = request.evidence.find(
        (candidate) => candidate.evidenceId === reference.id,
      );
      const kind =
        reference.kind === "artifact"
          ? REVIEW_ARTIFACT_SECTION_KIND
          : REVIEW_EVIDENCE_SECTION_KIND;
      const size = evidenceSize(reference);
      sections[evidenceId] = preserveLocalPresentation(
        makeSection({
          data: sectionData(request.request.id, reference.id),
          id: evidenceId,
          kind,
          name: evidenceTitle(request, reference),
          size,
          tagColor: resolved?.status === "failed" ? "#fb7185" : "#6680ad",
        }),
        current,
      );
      const position = placeEvidence(
        request,
        reference,
        controlSize.width,
        laneY,
        evidenceIndex,
      );
      const previousEvidence = current?.topLevelSections[evidenceId];
      topLevelSections[evidenceId] = previousEvidence ?? {
        h: size.height,
        w: size.width,
        x: position.x,
        y: position.y,
        zIndex: zIndex++,
      };
    });

    laneY += laneHeight(request) + LANE_GAP;
  }

  return {
    activeIds: [],
    savedViews: null,
    sections,
    topLevelSections,
    viewport: current?.viewport ?? { x: 0, y: 0, zoom: 0.78 },
  };
}

function distributedPosition(index: number, count: number): number {
  return (index + 1) / (count + 1);
}

type ReviewGraphProjection = Readonly<{
  edges: readonly WorkspaceGraphEdge[];
  ports: readonly WorkspaceGraphPort[];
  selectedEdgeIds: ReadonlySet<string>;
}>;

export function projectReviewGraph(
  snapshot: ReviewSnapshot,
  selection: ReviewSubjectSelection | null,
): ReviewGraphProjection {
  const edges: WorkspaceGraphEdge[] = [];
  const ports: WorkspaceGraphPort[] = [];
  const selectedEdgeIds = new Set<string>();

  for (const request of snapshot.requests) {
    const requestId = request.request.id;
    const relations = selection
      ? request.request.relations.filter(
          (relation) =>
            selection.requestId === requestId &&
            selection.subjectKind === relation.subjectKind &&
            selection.subjectId === relation.subjectId,
        )
      : [];
    relations.forEach((relation, index) => {
      const sourcePortId = relationPortId(relation.id, "source");
      const targetPortId = relationPortId(relation.id, "target");
      const edgeId = relationEdgeId(requestId, relation.id);
      ports.push(
        {
          family: "data",
          id: sourcePortId,
          label: relation.role,
          position: distributedPosition(index, relations.length),
          sectionId: requestSectionId(requestId),
          side: "right",
          type: "source",
        },
        {
          family: "data",
          id: targetPortId,
          label: relation.role,
          position: 0.5,
          sectionId: evidenceSectionId(requestId, relation.evidenceId),
          side: "left",
          type: "target",
        },
      );
      edges.push({
        family: "data",
        id: edgeId,
        label: relation.role,
        source: {
          portId: sourcePortId,
          sectionId: requestSectionId(requestId),
        },
        target: {
          portId: targetPortId,
          sectionId: evidenceSectionId(requestId, relation.evidenceId),
        },
      });
      selectedEdgeIds.add(edgeId);
    });
  }
  return { edges, ports, selectedEdgeIds };
}

export function relatedSectionIds(
  snapshot: ReviewSnapshot,
  selection: ReviewSubjectSelection,
): string[] {
  const request = snapshot.requests.find(
    (candidate) => candidate.request.id === selection.requestId,
  );
  if (!request) {
    return [];
  }
  const ids = request.request.relations
    .filter(
      (relation) =>
        relation.subjectKind === selection.subjectKind &&
        relation.subjectId === selection.subjectId,
    )
    .map((relation) =>
      evidenceSectionId(selection.requestId, relation.evidenceId),
    );
  return [requestSectionId(selection.requestId), ...new Set(ids)];
}
