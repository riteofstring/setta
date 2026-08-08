import {
  deriveWorkspaceParentLookup,
  type WorkspaceActionRejectionReason,
  type WorkspaceDocument,
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
      rootPositions: Readonly<Record<string, WorkspacePoint>> | null;
      status: "ready";
    }>
  | Readonly<{
      reason: Extract<
        WorkspaceActionRejectionReason,
        "canvas-unavailable" | "section-geometry-unavailable" | "section-not-container"
      >;
      status: "rejected";
    }>;

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
  let bounds: WorkspacePlacementRect | null = null;
  if (selection.parentSectionId === null) {
    if (!canvasController) {
      return { reason: "canvas-unavailable", status: "rejected" };
    }
    const rects = selection.sectionIds.map((sectionId) =>
      canvasController.getSectionRect(sectionId),
    );
    if (rects.some((rect) => rect === undefined)) {
      return { reason: "section-geometry-unavailable", status: "rejected" };
    }
    bounds = combinedBounds(rects as readonly WorkspacePlacementRect[]);
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
    group: groupedSection(definition, factoryResult, bounds),
    parentSectionId: selection.parentSectionId,
    position: bounds ? { x: bounds.x, y: bounds.y } : null,
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
  const occupied = [...occupiedRootRects];
  const positions: Record<string, WorkspacePoint> = {};
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
    return {
      childSectionIds: section.childLayout.sectionIds,
      parentSectionId,
      rootPositions: null,
      status: "ready",
    };
  }
  if (!canvasController) {
    return { reason: "canvas-unavailable", status: "rejected" };
  }
  const groupBounds = canvasController.getSectionRect(sectionId);
  if (!groupBounds) {
    return { reason: "section-geometry-unavailable", status: "rejected" };
  }
  return {
    childSectionIds: section.childLayout.sectionIds,
    parentSectionId,
    rootPositions: planWorkspaceTopLevelUngroupPositions(
      document,
      section as WorkspaceSection<unknown>,
      groupBounds,
      rootPlacementRects(document, sectionId, canvasController),
    ),
    status: "ready",
  };
}
