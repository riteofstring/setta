import {
  deriveWorkspaceParentLookup,
  type WorkspaceActionRejectionReason,
  type WorkspaceChildLayout,
  type WorkspaceDocument,
  type WorkspaceFreeformChildLayout,
  type WorkspacePoint,
  type WorkspaceSection,
} from "../core.js";
import { optionOverridesAt } from "./runtime-option-validation.js";
import type { WorkspaceCanvasController } from "./workspace-canvas-navigation.js";
import type {
  WorkspaceGroupFactory,
  WorkspaceGroupFactoryResult,
} from "./workspace-section-contract.js";
import type {
  ResolvedSectionDefinition,
  WorkspaceSectionRegistry,
} from "./workspace-section-registry.js";
import { normalizeWorkspaceSelectionRoots } from "./workspace-selection.js";
import type { WorkspacePlacementRect } from "./workspace-smart-placement.js";

export type WorkspaceSiblingSelection = Readonly<{
  parentSectionId: string | null;
  sectionIds: readonly string[];
}>;

export type WorkspaceGroupingPlan<TSectionData> =
  | Readonly<{
      group: WorkspaceSection<TSectionData>;
      parentSectionId: string | null;
      position: WorkspacePoint | null;
      sectionIds: readonly string[];
      status: "ready";
    }>
  | Readonly<{
      reason: Extract<
        WorkspaceActionRejectionReason,
        | "canvas-unavailable"
        | "group-kind-cannot-contain-sections"
        | "group-selection-too-small"
        | "mixed-parent-selection"
        | "section-geometry-unavailable"
        | "section-id-exists"
        | "unknown-section-kind"
      >;
      status: "rejected";
    }>;

export type WorkspaceUngroupingPlan =
  | Readonly<{
      childSectionIds: readonly string[];
      parentSectionId: string | null;
      positions: Readonly<Record<string, WorkspacePoint>> | null;
      status: "ready";
    }>
  | Readonly<{
      reason: Extract<
        WorkspaceActionRejectionReason,
        "canvas-unavailable" | "section-geometry-unavailable" | "section-not-container"
      >;
      status: "rejected";
    }>;

export function workspaceSectionGroupingMatches(
  document: WorkspaceDocument<unknown>,
  groupSectionId: string,
  parentSectionId: string | null,
  childSectionIds: readonly string[],
): boolean {
  const childIds = document.sections[groupSectionId]?.childLayout?.sectionIds;
  if (
    !childIds ||
    childIds.length !== childSectionIds.length ||
    childIds.some((sectionId, index) => sectionId !== childSectionIds[index])
  ) {
    return false;
  }
  return (deriveWorkspaceParentLookup(document).get(groupSectionId) ?? null) === parentSectionId;
}

export function workspaceSectionUngroupingMatches(
  document: WorkspaceDocument<unknown>,
  groupSectionId: string,
  parentSectionId: string | null,
  childSectionIds: readonly string[],
): boolean {
  if (Object.hasOwn(document.sections, groupSectionId)) {
    return false;
  }
  const parentLookup = deriveWorkspaceParentLookup(document);
  return childSectionIds.every(
    (sectionId) => (parentLookup.get(sectionId) ?? null) === parentSectionId,
  );
}

const groupFactoryResultKeys = ["data", "id", "kind", "title"] as const;
const UNGROUP_GAP = 24;

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function groupFactoryResultAt<TSectionData>(
  value: WorkspaceGroupFactoryResult<TSectionData>,
): WorkspaceGroupFactoryResult<TSectionData> {
  const result = optionOverridesAt(
    value,
    groupFactoryResultKeys,
    "Workspace group factory result",
    "workspace group factory result field",
  );
  if (!Object.hasOwn(result, "data")) {
    throw new TypeError("Workspace group factory result must provide data.");
  }
  return {
    data: result.data as TSectionData,
    id: nonEmptyString(result.id, "Workspace group factory result id"),
    kind: nonEmptyString(result.kind, "Workspace group factory result kind"),
    title: nonEmptyString(result.title, "Workspace group factory result title").trim(),
  };
}

function siblingOrder(
  document: WorkspaceDocument<unknown>,
  parentSectionId: string | null,
): readonly string[] {
  return parentSectionId === null
    ? document.rootSections.map(({ sectionId }) => sectionId)
    : (document.sections[parentSectionId]?.childLayout?.sectionIds ?? []);
}

export function resolveWorkspaceSiblingSelection(
  document: WorkspaceDocument<unknown>,
  selectedSectionIds: readonly string[],
):
  | Readonly<{ reason: "group-selection-too-small" | "mixed-parent-selection"; status: "rejected" }>
  | Readonly<{ selection: WorkspaceSiblingSelection; status: "ready" }> {
  const sectionIds = normalizeWorkspaceSelectionRoots(document, selectedSectionIds);
  if (sectionIds.length < 2) {
    return { reason: "group-selection-too-small", status: "rejected" };
  }
  const parentLookup = deriveWorkspaceParentLookup(document);
  const parentSectionId = parentLookup.get(sectionIds[0] as string) ?? null;
  if (sectionIds.some((sectionId) => (parentLookup.get(sectionId) ?? null) !== parentSectionId)) {
    return { reason: "mixed-parent-selection", status: "rejected" };
  }
  const selected = new Set(sectionIds);
  return {
    selection: {
      parentSectionId,
      sectionIds: siblingOrder(document, parentSectionId).filter((sectionId) =>
        selected.has(sectionId),
      ),
    },
    status: "ready",
  };
}

function combinedBounds(rects: readonly WorkspacePlacementRect[]): WorkspacePlacementRect {
  const first = rects[0];
  if (!first) {
    throw new Error("Workspace grouping needs at least one measured section rectangle.");
  }
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return { height: bottom - y, width: right - x, x, y };
}

function groupedAxisValue<TSectionData>(
  definition: ResolvedSectionDefinition<TSectionData>,
  axis: "height" | "width",
  bounds: WorkspacePlacementRect | null,
): number {
  const desired = bounds?.[axis] ?? definition.defaultSize[axis];
  const minimum = definition.resize.minSize[axis] ?? 0;
  const maximum = definition.resize.maxSize[axis] ?? Number.POSITIVE_INFINITY;
  return Math.max(minimum, Math.min(desired, maximum));
}

function groupedSection<TSectionData>(
  definition: ResolvedSectionDefinition<TSectionData>,
  result: WorkspaceGroupFactoryResult<TSectionData>,
  bounds: WorkspacePlacementRect | null,
): WorkspaceSection<TSectionData> {
  return {
    childLayout: {
      orientation: definition.defaultChildOrientation,
      overflow: definition.defaultChildOverflow,
      positioning: "ordered",
      sectionIds: [],
    },
    data: result.data,
    id: result.id,
    isMinimized: false,
    kind: definition.kind,
    positionAndSizeLocked: false,
    presentation: { accentColor: null, chrome: definition.chrome, tagColor: null },
    size: {
      height: {
        mode: definition.defaultSizeMode.height,
        value: groupedAxisValue(definition, "height", bounds),
      },
      width: {
        mode: definition.defaultSizeMode.width,
        value: groupedAxisValue(definition, "width", bounds),
      },
    },
    title: result.title,
  };
}

type GroupingBoundsResult =
  | Readonly<{ bounds: WorkspacePlacementRect | null; status: "ready" }>
  | Readonly<{
      reason: "canvas-unavailable" | "section-geometry-unavailable";
      status: "rejected";
    }>;

function groupingParentLayout(
  document: WorkspaceDocument<unknown>,
  parentSectionId: string | null,
): WorkspaceChildLayout | null {
  return parentSectionId === null
    ? null
    : (document.sections[parentSectionId]?.childLayout ?? null);
}

function groupingPosition(
  parentLayout: WorkspaceChildLayout | null,
  sectionId: string,
  rect: WorkspacePlacementRect,
): WorkspacePoint {
  return parentLayout?.positioning === "freeform"
    ? requiredFreeformPosition(parentLayout, sectionId)
    : { x: rect.x, y: rect.y };
}

function groupingBounds(
  document: WorkspaceDocument<unknown>,
  selection: WorkspaceSiblingSelection,
  canvasController: WorkspaceCanvasController | null,
): GroupingBoundsResult {
  const parentLayout = groupingParentLayout(document, selection.parentSectionId);
  if (parentLayout?.positioning === "ordered") {
    return { bounds: null, status: "ready" };
  }
  if (!canvasController) {
    return { reason: "canvas-unavailable", status: "rejected" };
  }
  const rects: WorkspacePlacementRect[] = [];
  for (const sectionId of selection.sectionIds) {
    const rect = canvasController.getSectionRect(sectionId);
    if (!isMeasuredPlacementRect(rect)) {
      return { reason: "section-geometry-unavailable", status: "rejected" };
    }
    const position = groupingPosition(parentLayout, sectionId, rect);
    rects.push({ ...rect, x: position.x, y: position.y });
  }
  return { bounds: combinedBounds(rects), status: "ready" };
}

function isMeasuredPlacementRect(
  rect: WorkspacePlacementRect | undefined,
): rect is WorkspacePlacementRect {
  return Boolean(
    rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    rect.width > 0 &&
    Number.isFinite(rect.height) &&
    rect.height > 0,
  );
}

function requiredFreeformPosition(
  layout: WorkspaceFreeformChildLayout,
  sectionId: string,
): WorkspacePoint {
  const position = layout.positions[sectionId];
  if (!position) {
    throw new Error(`Workspace freeform child ${sectionId} is missing its canonical position.`);
  }
  return position;
}

export function planWorkspaceSectionGrouping<TSectionData>({
  canvasController,
  document,
  factory,
  registry,
  sectionIds,
}: Readonly<{
  canvasController: WorkspaceCanvasController | null;
  document: WorkspaceDocument<TSectionData>;
  factory: WorkspaceGroupFactory<TSectionData>;
  registry: WorkspaceSectionRegistry<TSectionData>;
  sectionIds: readonly string[];
}>): WorkspaceGroupingPlan<TSectionData> {
  const resolvedSelection = resolveWorkspaceSiblingSelection(document, sectionIds);
  if (resolvedSelection.status === "rejected") {
    return resolvedSelection;
  }
  const selection = resolvedSelection.selection;
  const boundsResult = groupingBounds(document, selection, canvasController);
  if (boundsResult.status === "rejected") {
    return boundsResult;
  }
  const factoryResult = groupFactoryResultAt(
    factory({
      parentSectionId: selection.parentSectionId,
      sectionIds: Object.freeze([...selection.sectionIds]),
    }),
  );
  if (Object.hasOwn(document.sections, factoryResult.id)) {
    return { reason: "section-id-exists", status: "rejected" };
  }
  const definition = registry.definition(factoryResult.kind);
  if (!definition) {
    return { reason: "unknown-section-kind", status: "rejected" };
  }
  if (!definition.canContainSections) {
    return { reason: "group-kind-cannot-contain-sections", status: "rejected" };
  }
  return {
    group: groupedSection(definition, factoryResult, boundsResult.bounds),
    parentSectionId: selection.parentSectionId,
    position: boundsResult.bounds ? { x: boundsResult.bounds.x, y: boundsResult.bounds.y } : null,
    sectionIds: selection.sectionIds,
    status: "ready",
  };
}

function placementRect(
  section: WorkspaceSection<unknown>,
  position: WorkspacePoint,
): WorkspacePlacementRect {
  return {
    height: section.size.height.value,
    width: section.size.width.value,
    x: position.x,
    y: position.y,
  };
}

function rectanglesOverlap(left: WorkspacePlacementRect, right: WorkspacePlacementRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function clearMainAxisPosition(
  candidate: WorkspacePlacementRect,
  occupied: readonly WorkspacePlacementRect[],
  orientation: "horizontal" | "vertical",
): WorkspacePlacementRect {
  let positioned = candidate;
  while (true) {
    const collisions = occupied.filter((rect) => rectanglesOverlap(positioned, rect));
    if (collisions.length === 0) {
      return positioned;
    }
    positioned =
      orientation === "horizontal"
        ? {
            ...positioned,
            x: Math.max(...collisions.map((rect) => rect.x + rect.width + UNGROUP_GAP)),
          }
        : {
            ...positioned,
            y: Math.max(...collisions.map((rect) => rect.y + rect.height + UNGROUP_GAP)),
          };
  }
}

function planWorkspaceTopLevelUngroupPositions(
  document: WorkspaceDocument<unknown>,
  group: WorkspaceSection<unknown>,
  groupBounds: WorkspacePlacementRect,
  occupiedRootRects: readonly WorkspacePlacementRect[],
): Readonly<Record<string, WorkspacePoint>> {
  const childLayout = group.childLayout;
  if (!childLayout) {
    throw new TypeError("Workspace ungrouping requires a container section.");
  }
  if (childLayout.positioning !== "ordered") {
    throw new TypeError("Ordered workspace ungroup placement requires an ordered container.");
  }
  const occupied = [...occupiedRootRects];
  const positions = Object.create(null) as Record<string, WorkspacePoint>;
  let cursor = { x: groupBounds.x, y: groupBounds.y };
  for (const sectionId of childLayout.sectionIds) {
    const section = document.sections[sectionId] as WorkspaceSection<unknown>;
    const positioned = clearMainAxisPosition(
      placementRect(section, cursor),
      occupied,
      childLayout.orientation,
    );
    positions[sectionId] = { x: positioned.x, y: positioned.y };
    occupied.push(positioned);
    cursor =
      childLayout.orientation === "horizontal"
        ? { x: positioned.x + positioned.width + UNGROUP_GAP, y: groupBounds.y }
        : { x: groupBounds.x, y: positioned.y + positioned.height + UNGROUP_GAP };
  }
  return positions;
}

function rootPlacementRects<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  excludedSectionId: string,
  canvasController: WorkspaceCanvasController,
): readonly WorkspacePlacementRect[] {
  return document.rootSections
    .filter(({ sectionId }) => sectionId !== excludedSectionId)
    .map((root) => {
      const measured = canvasController.getSectionRect(root.sectionId);
      return (
        measured ??
        placementRect(document.sections[root.sectionId] as WorkspaceSection, root.position)
      );
    });
}

function nestedUngroupingPlan<TSectionData>(
  canvasController: WorkspaceCanvasController | null,
  document: WorkspaceDocument<TSectionData>,
  section: WorkspaceSection<TSectionData>,
  parentSectionId: string,
): WorkspaceUngroupingPlan {
  const childLayout = section.childLayout;
  if (!childLayout) {
    throw new TypeError("Workspace ungrouping requires a container section.");
  }
  const parentLayout = document.sections[parentSectionId]?.childLayout;
  if (parentLayout?.positioning !== "freeform") {
    return {
      childSectionIds: childLayout.sectionIds,
      parentSectionId,
      positions: null,
      status: "ready",
    };
  }
  if (!canvasController) {
    return { reason: "canvas-unavailable", status: "rejected" };
  }
  const positions = measuredNestedUngroupPositions(
    childLayout.sectionIds,
    parentLayout,
    section,
    canvasController,
  );
  return positions
    ? { childSectionIds: childLayout.sectionIds, parentSectionId, positions, status: "ready" }
    : { reason: "section-geometry-unavailable", status: "rejected" };
}

function measuredRootUngroupPositions(
  sectionIds: readonly string[],
  canvasController: WorkspaceCanvasController,
): Readonly<Record<string, WorkspacePoint>> | null {
  const positions = Object.create(null) as Record<string, WorkspacePoint>;
  for (const sectionId of sectionIds) {
    const rect = canvasController.getSectionRect(sectionId);
    if (!isMeasuredPlacementRect(rect)) {
      return null;
    }
    positions[sectionId] = { x: rect.x, y: rect.y };
  }
  return positions;
}

function translatePositionsInsideStartEdges(
  positions: Readonly<Record<string, WorkspacePoint>>,
): Readonly<Record<string, WorkspacePoint>> {
  const values = Object.values(positions);
  const translateX = Math.max(0, -Math.min(...values.map(({ x }) => x)));
  const translateY = Math.max(0, -Math.min(...values.map(({ y }) => y)));
  return Object.fromEntries(
    Object.entries(positions).map(([sectionId, position]) => [
      sectionId,
      { x: position.x + translateX, y: position.y + translateY },
    ]),
  );
}

function measuredNestedUngroupPositions(
  childSectionIds: readonly string[],
  parentLayout: WorkspaceFreeformChildLayout,
  group: WorkspaceSection<unknown>,
  canvasController: WorkspaceCanvasController,
): Readonly<Record<string, WorkspacePoint>> | null {
  const groupPosition = requiredFreeformPosition(parentLayout, group.id);
  const groupRect = canvasController.getSectionRect(group.id);
  if (!isMeasuredPlacementRect(groupRect)) {
    return null;
  }
  const positions = Object.create(null) as Record<string, WorkspacePoint>;
  for (const sectionId of childSectionIds) {
    const childRect = canvasController.getSectionRect(sectionId);
    if (!isMeasuredPlacementRect(childRect)) {
      return null;
    }
    positions[sectionId] = {
      x: groupPosition.x + childRect.x - groupRect.x,
      y: groupPosition.y + childRect.y - groupRect.y,
    };
  }
  return translatePositionsInsideStartEdges(positions);
}

function topLevelUngroupingPlan<TSectionData>(
  canvasController: WorkspaceCanvasController | null,
  document: WorkspaceDocument<TSectionData>,
  section: WorkspaceSection<TSectionData>,
): WorkspaceUngroupingPlan {
  const childLayout = section.childLayout;
  if (!childLayout) {
    throw new TypeError("Workspace ungrouping requires a container section.");
  }
  if (!canvasController) {
    return { reason: "canvas-unavailable", status: "rejected" };
  }
  const groupBounds = canvasController.getSectionRect(section.id);
  if (!groupBounds) {
    return { reason: "section-geometry-unavailable", status: "rejected" };
  }
  if (childLayout.positioning === "freeform") {
    const positions = measuredRootUngroupPositions(childLayout.sectionIds, canvasController);
    return positions
      ? {
          childSectionIds: childLayout.sectionIds,
          parentSectionId: null,
          positions,
          status: "ready",
        }
      : { reason: "section-geometry-unavailable", status: "rejected" };
  }
  return {
    childSectionIds: childLayout.sectionIds,
    parentSectionId: null,
    positions: planWorkspaceTopLevelUngroupPositions(
      document,
      section as WorkspaceSection<unknown>,
      groupBounds,
      rootPlacementRects(document, section.id, canvasController),
    ),
    status: "ready",
  };
}

export function planWorkspaceSectionUngrouping<TSectionData>({
  canvasController,
  document,
  sectionId,
}: Readonly<{
  canvasController: WorkspaceCanvasController | null;
  document: WorkspaceDocument<TSectionData>;
  sectionId: string;
}>): WorkspaceUngroupingPlan {
  const section = document.sections[sectionId];
  if (!section?.childLayout || section.childLayout.sectionIds.length === 0) {
    return { reason: "section-not-container", status: "rejected" };
  }
  const parentSectionId = deriveWorkspaceParentLookup(document).get(sectionId) ?? null;
  if (parentSectionId !== null) {
    return nestedUngroupingPlan(canvasController, document, section, parentSectionId);
  }
  return topLevelUngroupingPlan(canvasController, document, section);
}
