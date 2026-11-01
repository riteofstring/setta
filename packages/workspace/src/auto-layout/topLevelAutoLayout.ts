import { getWorkspaceCapabilitiesStore } from "../document/capabilities.js";
import { getVisibleTopLevelSectionIdsForDisplay } from "../document/savedViewDisplay.js";
import { commitWorkspaceDocumentMutation } from "../document/loadWorkspaceDocument.js";
import {
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "../document/stores.js";
import type {
  Node,
  TopLevelSectionLayout,
  WorkspaceDocument,
} from "../document/types.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import {
  planWorkspaceTopLevelAutoLayout,
  resolveWorkspaceTopLevelAutoLayoutGap,
  type WorkspaceTopLevelAutoLayoutOptions,
  type WorkspaceTopLevelAutoLayoutPlan,
  type WorkspaceTopLevelAutoLayoutRectangle,
} from "./planner.js";

export type WorkspaceTopLevelAutoLayoutResult = "applied" | "unchanged";

const LAYOUT_DISABLED_REASON = "Layout editing is disabled in this workspace.";
const INSUFFICIENT_SECTIONS_REASON =
  "Auto layout requires at least two unlocked top-level sections.";
const GEOMETRY_DISABLED_REASON =
  "Auto layout requires measured geometry for every displayed top-level section.";
const ALREADY_ARRANGED_REASON = "Top-level sections are already arranged.";

type UnavailableAutoLayoutPreparation = Readonly<{
  kind: "capability" | "geometry" | "insufficient" | "unchanged";
  reason: string;
}>;

type AutoLayoutPreparation =
  | UnavailableAutoLayoutPreparation
  | Readonly<{
      document: WorkspaceDocument;
      kind: "ready";
      plan: WorkspaceTopLevelAutoLayoutPlan;
      rectangles: ReadonlyArray<WorkspaceTopLevelAutoLayoutRectangle>;
    }>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function hasUsableGeometry(
  layout: TopLevelSectionLayout | undefined,
  node: Node | undefined,
): boolean {
  return (
    layout !== undefined &&
    node !== undefined &&
    isFiniteNumber(layout.x) &&
    isFiniteNumber(layout.y) &&
    isFiniteNumber(layout.zIndex) &&
    isFiniteNumber(node.position.x) &&
    isFiniteNumber(node.position.y) &&
    isPositiveFiniteNumber(node.width) &&
    isPositiveFiniteNumber(node.height)
  );
}

function collectTopLevelAutoLayoutRectangles(
  state: WorkspaceDocumentState,
  sectionIds: ReadonlyArray<string>,
  nodes: ReadonlyMap<string, Node>,
): Array<WorkspaceTopLevelAutoLayoutRectangle> | null {
  const rectangles: Array<WorkspaceTopLevelAutoLayoutRectangle> = [];
  for (const sectionId of sectionIds) {
    const section = state.sections[sectionId];
    const layout = state.topLevelSections[sectionId];
    const node = nodes.get(sectionId);
    if (!section || !layout || !node || !hasUsableGeometry(layout, node)) {
      return null;
    }
    if (node.width === null || node.height === null) {
      return null;
    }
    rectangles.push({
      height: node.height,
      id: sectionId,
      locked: section.positionAndSizeLocked,
      width: node.width,
      x: layout.x,
      y: layout.y,
      zIndex: layout.zIndex,
    });
  }
  return rectangles;
}

function countMovableRectangles(
  state: WorkspaceDocumentState,
  sectionIds: ReadonlyArray<string>,
): number | null {
  let count = 0;
  for (const sectionId of sectionIds) {
    const section = state.sections[sectionId];
    if (!section) {
      return null;
    }
    if (!section.positionAndSizeLocked) {
      count += 1;
    }
  }
  return count;
}

function hasPlanChanges(
  rectangles: ReadonlyArray<WorkspaceTopLevelAutoLayoutRectangle>,
  plan: WorkspaceTopLevelAutoLayoutPlan,
): boolean {
  return rectangles.some((rectangle) => {
    if (rectangle.locked) {
      return false;
    }
    const position = plan.positionsById[rectangle.id];
    return (
      position === undefined ||
      position.x !== rectangle.x ||
      position.y !== rectangle.y
    );
  });
}

function prepareAutoLayout(
  host: WorkspaceHost,
  options: WorkspaceTopLevelAutoLayoutOptions | undefined,
): AutoLayoutPreparation {
  resolveWorkspaceTopLevelAutoLayoutGap(options);
  if (!getWorkspaceCapabilitiesStore(host).getState().canEditLayout) {
    return { kind: "capability", reason: LAYOUT_DISABLED_REASON };
  }
  const state = getWorkspaceDocumentStore(host).getState();
  const sectionIds = getVisibleTopLevelSectionIdsForDisplay(state);
  const movableCount = countMovableRectangles(state, sectionIds);
  if (movableCount === null) {
    return { kind: "geometry", reason: GEOMETRY_DISABLED_REASON };
  }
  if (movableCount < 2) {
    return { kind: "insufficient", reason: INSUFFICIENT_SECTIONS_REASON };
  }
  const rectangles = collectTopLevelAutoLayoutRectangles(
    state,
    sectionIds,
    getNodeInternalsStore(host).getState().x,
  );
  if (rectangles === null) {
    return { kind: "geometry", reason: GEOMETRY_DISABLED_REASON };
  }
  const plan = planWorkspaceTopLevelAutoLayout(rectangles, options);
  if (!hasPlanChanges(rectangles, plan)) {
    return { kind: "unchanged", reason: ALREADY_ARRANGED_REASON };
  }
  return {
    document: host.getSnapshot(),
    kind: "ready",
    plan,
    rectangles,
  };
}

export function getWorkspaceTopLevelAutoLayoutDisabledReason(
  host: WorkspaceHost,
  options?: WorkspaceTopLevelAutoLayoutOptions,
): string | null {
  const preparation = prepareAutoLayout(host, options);
  return preparation.kind === "ready" ? null : preparation.reason;
}

function resolveUnavailableAutoLayout(
  preparation: UnavailableAutoLayoutPreparation,
): WorkspaceTopLevelAutoLayoutResult {
  if (preparation.kind === "insufficient" || preparation.kind === "unchanged") {
    return "unchanged";
  }
  throw new Error(preparation.reason);
}

function applyAutoLayoutPlan(
  document: WorkspaceDocument,
  rectangles: ReadonlyArray<WorkspaceTopLevelAutoLayoutRectangle>,
  plan: WorkspaceTopLevelAutoLayoutPlan,
): WorkspaceDocument["topLevelSections"] {
  const topLevelSections = { ...document.topLevelSections };
  for (const rectangle of rectangles) {
    if (rectangle.locked) {
      continue;
    }
    const position = plan.positionsById[rectangle.id];
    if (!position) {
      throw new Error(`Auto-layout plan is missing section ${rectangle.id}.`);
    }
    const layout = topLevelSections[rectangle.id];
    if (!layout) {
      throw new Error(`Auto-layout plan is missing section ${rectangle.id}.`);
    }
    topLevelSections[rectangle.id] = {
      ...layout,
      x: position.x,
      y: position.y,
    };
  }
  return topLevelSections;
}

export function autoLayoutTopLevelSections(
  host: WorkspaceHost,
  options?: WorkspaceTopLevelAutoLayoutOptions,
): WorkspaceTopLevelAutoLayoutResult {
  const preparation = prepareAutoLayout(host, options);
  if (preparation.kind !== "ready") {
    return resolveUnavailableAutoLayout(preparation);
  }
  commitWorkspaceDocumentMutation(
    host,
    {
      ...preparation.document,
      topLevelSections: applyAutoLayoutPlan(
        preparation.document,
        preparation.rectangles,
        preparation.plan,
      ),
    },
    "section-move",
  );
  return "applied";
}
