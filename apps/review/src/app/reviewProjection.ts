import type {
  TopLevelSectionLayout,
  WorkspaceDocument,
  WorkspaceDocumentInput,
  WorkspaceGraphEdge,
  WorkspaceGraphPort,
  WorkspaceSavedView,
  WorkspaceSectionInput,
} from "@setta/workspace";
import { parseWorkspaceSavedViewsState } from "@setta/workspace";

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
const LANE_START_Y = 64;
const LANE_GAP = 160;
const CURRENT_VIEW_ID = "current";
const OLD_VIEW_ID = "old";
const INITIAL_VIEWPORT = { x: 0, y: 0, zoom: 0.78 };

type ReviewViewId = typeof CURRENT_VIEW_ID | typeof OLD_VIEW_ID;
type ReviewLayouts = Record<
  ReviewViewId,
  Record<string, TopLevelSectionLayout>
>;
type ReviewLayoutGroup = Readonly<{
  controlId: string;
  height: number;
  sectionIds: readonly string[];
  viewId: ReviewViewId;
  y: number;
}>;

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
}>;

function makeSection({
  data,
  id,
  kind,
  name,
  size,
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
    tagColor: null,
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
    const height = Math.min(
      520,
      Math.max(320, 212 + request.request.choice.options.length * 58),
    );
    return { height, width: 440 };
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

function requestView(request: RequestSnapshot): ReviewViewId {
  return request.response?.status === "final" ? OLD_VIEW_ID : CURRENT_VIEW_ID;
}

function preservedViewLayout(
  current: WorkspaceDocument | undefined,
  viewId: ReviewViewId,
  sectionId: string,
  visible: boolean,
): TopLevelSectionLayout | undefined {
  const previousView = current?.savedViews?.views[viewId];
  if (previousView) {
    const wasVisible = previousView.sectionVisibility[sectionId] === true;
    if (wasVisible === visible) {
      return previousView.topLevelSections[sectionId];
    }
    return undefined;
  }
  if (viewId === CURRENT_VIEW_ID && current?.savedViews === null && visible) {
    return current.topLevelSections[sectionId];
  }
  return undefined;
}

function previousViewViewport(
  current: WorkspaceDocument | undefined,
  viewId: ReviewViewId,
): WorkspaceSavedView["viewport"] {
  const previous = current?.savedViews?.views[viewId];
  if (previous) {
    return previous.viewport;
  }
  if (viewId === CURRENT_VIEW_ID && current?.savedViews === null) {
    return current.viewport;
  }
  return { ...INITIAL_VIEWPORT };
}

function previousGroupBottom(
  group: ReviewLayoutGroup,
  view: WorkspaceSavedView,
  generatedLayouts: ReviewLayouts,
): number {
  const controlLayout =
    view.topLevelSections[group.controlId] ??
    generatedLayouts[group.viewId][group.controlId];
  if (!controlLayout) {
    throw new Error(`Review section ${group.controlId} has no layout.`);
  }
  let bottom = controlLayout.y + group.height;
  for (const sectionId of group.sectionIds) {
    const layout =
      view.topLevelSections[sectionId] ??
      generatedLayouts[group.viewId][sectionId];
    const generated = generatedLayouts[group.viewId][sectionId];
    if (!layout || !generated) {
      throw new Error(`Review section ${sectionId} has no layout.`);
    }
    bottom = Math.max(bottom, layout.y + (layout.h ?? generated.h ?? 0));
  }
  return bottom;
}

function appendNewViewGroups(
  generatedLayouts: ReviewLayouts,
  groups: readonly ReviewLayoutGroup[],
  current: WorkspaceDocument | undefined,
): void {
  for (const viewId of [CURRENT_VIEW_ID, OLD_VIEW_ID] as const) {
    const previousView = current?.savedViews?.views[viewId];
    if (!previousView) {
      continue;
    }
    const residents = groups.filter(
      (group) =>
        group.viewId === viewId &&
        previousView.sectionVisibility[group.controlId] === true,
    );
    const arrivals = groups.filter(
      (group) =>
        group.viewId === viewId &&
        previousView.sectionVisibility[group.controlId] !== true,
    );
    let nextY = residents.reduce(
      (bottom, group) =>
        Math.max(
          bottom,
          previousGroupBottom(group, previousView, generatedLayouts) + LANE_GAP,
        ),
      LANE_START_Y,
    );
    for (const group of arrivals) {
      const offset = nextY - group.y;
      for (const sectionId of group.sectionIds) {
        const layout = generatedLayouts[viewId][sectionId];
        if (!layout) {
          throw new Error(`Review section ${sectionId} has no layout.`);
        }
        generatedLayouts[viewId][sectionId] = {
          ...layout,
          y: layout.y + offset,
        };
      }
      nextY += group.height + LANE_GAP;
    }
  }
}

function mirrorHiddenViewLayouts(
  generatedLayouts: ReviewLayouts,
  sectionViews: Readonly<Record<string, ReviewViewId>>,
): void {
  for (const [sectionId, viewId] of Object.entries(sectionViews)) {
    const layout = generatedLayouts[viewId][sectionId];
    if (!layout) {
      throw new Error(`Review section ${sectionId} has no generated layout.`);
    }
    const otherViewId =
      viewId === CURRENT_VIEW_ID ? OLD_VIEW_ID : CURRENT_VIEW_ID;
    generatedLayouts[otherViewId][sectionId] = { ...layout };
  }
}

function createReviewView(
  viewId: ReviewViewId,
  sortIndex: number,
  generatedLayouts: ReviewLayouts,
  sectionViews: Readonly<Record<string, ReviewViewId>>,
  current: WorkspaceDocument | undefined,
): WorkspaceSavedView {
  const sectionVisibility: Record<string, boolean> = {};
  const topLevelSections: Record<string, TopLevelSectionLayout> = {};
  for (const [sectionId, ownerViewId] of Object.entries(sectionViews)) {
    const visible = ownerViewId === viewId;
    sectionVisibility[sectionId] = visible;
    const generated = generatedLayouts[viewId][sectionId];
    if (!generated) {
      throw new Error(`Review section ${sectionId} has no ${viewId} layout.`);
    }
    topLevelSections[sectionId] =
      preservedViewLayout(current, viewId, sectionId, visible) ?? generated;
  }
  return {
    id: viewId,
    isTab: true,
    name: viewId === CURRENT_VIEW_ID ? "Current" : "Old",
    sectionVisibility,
    sortIndex,
    topLevelSections,
    viewport: previousViewViewport(current, viewId),
  };
}

function createReviewViews(
  generatedLayouts: ReviewLayouts,
  sectionViews: Readonly<Record<string, ReviewViewId>>,
  current: WorkspaceDocument | undefined,
): Record<string, WorkspaceSavedView> {
  return Object.fromEntries(
    ([CURRENT_VIEW_ID, OLD_VIEW_ID] as const).map((viewId, sortIndex) => [
      viewId,
      createReviewView(
        viewId,
        sortIndex,
        generatedLayouts,
        sectionViews,
        current,
      ),
    ]),
  );
}

export function projectReviewDocument(
  snapshot: ReviewSnapshot,
  current?: WorkspaceDocument,
): WorkspaceDocumentInput {
  const sections: WorkspaceDocumentInput["sections"] = {};
  const generatedLayouts: ReviewLayouts = { current: {}, old: {} };
  const sectionViews: Record<string, ReviewViewId> = {};
  const groups: ReviewLayoutGroup[] = [];
  const laneY: Record<ReviewViewId, number> = {
    current: LANE_START_Y,
    old: LANE_START_Y,
  };
  const zIndex: Record<ReviewViewId, number> = { current: 0, old: 0 };

  for (const request of snapshot.requests) {
    const viewId = requestView(request);
    const groupY = laneY[viewId];
    const controlId = requestSectionId(request.request.id);
    const groupSectionIds = [controlId];
    const controlSize = requestSize(request);
    sections[controlId] = preserveLocalPresentation(
      makeSection({
        data: sectionData(request.request.id),
        id: controlId,
        kind: requestKind(request),
        name: request.request.title,
        size: controlSize,
      }),
      current,
    );
    sectionViews[controlId] = viewId;
    generatedLayouts[viewId][controlId] = {
      h: controlSize.height === "auto" ? null : controlSize.height,
      w: controlSize.width,
      x: REQUEST_X,
      y: laneY[viewId],
      zIndex: zIndex[viewId]++,
    };

    request.request.evidence.forEach((reference, evidenceIndex) => {
      const evidenceId = evidenceSectionId(request.request.id, reference.id);
      groupSectionIds.push(evidenceId);
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
        }),
        current,
      );
      sectionViews[evidenceId] = viewId;
      const position = placeEvidence(
        request,
        reference,
        controlSize.width,
        laneY[viewId],
        evidenceIndex,
      );
      generatedLayouts[viewId][evidenceId] = {
        h: size.height,
        w: size.width,
        x: position.x,
        y: position.y,
        zIndex: zIndex[viewId]++,
      };
    });

    const height = laneHeight(request);
    groups.push({
      controlId,
      height,
      sectionIds: groupSectionIds,
      viewId,
      y: groupY,
    });
    laneY[viewId] += height + LANE_GAP;
  }

  appendNewViewGroups(generatedLayouts, groups, current);
  mirrorHiddenViewLayouts(generatedLayouts, sectionViews);
  const views = createReviewViews(generatedLayouts, sectionViews, current);
  const previousActiveViewId = current?.savedViews?.activeViewId;
  const activeViewId =
    previousActiveViewId === OLD_VIEW_ID ? OLD_VIEW_ID : CURRENT_VIEW_ID;
  const savedViews = parseWorkspaceSavedViewsState({ activeViewId, views });
  const activeView = savedViews.views[activeViewId];
  if (!activeView) {
    throw new Error(`Review view ${activeViewId} is unavailable.`);
  }

  return {
    activeIds: [],
    savedViews,
    sections,
    topLevelSections: activeView.topLevelSections,
    viewport: activeView.viewport,
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
