import type {
  WorkspaceChildLayout,
  WorkspaceDocument,
  WorkspaceJsonValue,
  WorkspacePoint,
} from "../core.js";
import type { WorkspaceGeometryIndex, WorkspaceRect } from "./geometry-index.js";
import { optionOverridesAt } from "./runtime-option-validation.js";
import type {
  WorkspaceExternalDropCandidate,
  WorkspaceExternalDropDecision,
} from "./workspace-react-contract.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";

const decisionKeys = ["allowed", "label", "reason"] as const;

export type WorkspaceExternalDropFreeformRegion = Readonly<{
  parentSectionId: string;
  surfaceWorkspaceRect: WorkspaceRect;
  workspaceRect: WorkspaceRect;
}>;

function insertionIndexForParent<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  geometryIndex: WorkspaceGeometryIndex,
  parentSectionId: string,
  position: WorkspacePoint,
): number {
  const section = document.sections[parentSectionId];
  const childLayout = section?.childLayout;
  if (!childLayout) {
    throw new Error(`External-drop parent ${parentSectionId} has no child layout.`);
  }
  if (childLayout.positioning === "freeform") {
    throw new Error(`External-drop parent ${parentSectionId} must use ordered positioning.`);
  }
  const axis = childLayout.orientation === "horizontal" ? "x" : "y";
  const coordinate = position[axis];
  for (const [index, sectionId] of childLayout.sectionIds.entries()) {
    const frame = geometryIndex.get(sectionId);
    if (
      frame &&
      coordinate < frame.rect[axis] + frame.rect[axis === "x" ? "width" : "height"] / 2
    ) {
      return index;
    }
  }
  return childLayout.sectionIds.length;
}

function containingParent<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  geometryIndex: WorkspaceGeometryIndex,
  freeformRegions: readonly WorkspaceExternalDropFreeformRegion[],
  registry: WorkspaceSectionRegistry<TSectionData>,
  position: WorkspacePoint,
): string | null {
  for (const frame of geometryIndex.framesAt(position)) {
    const layout = containingLayout(document, registry, frame.sectionId);
    if (!layout) {
      continue;
    }
    if (layout.positioning === "ordered") {
      return frame.sectionId;
    }
    if (freeformParentContains(frame.sectionId, freeformRegions, position)) {
      return frame.sectionId;
    }
  }
  return null;
}

function containingLayout<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  registry: WorkspaceSectionRegistry<TSectionData>,
  sectionId: string,
): WorkspaceChildLayout | null {
  const section = document.sections[sectionId];
  if (!section) return null;
  const definition = registry.definition(section.kind);
  if (!definition?.canContainSections) return null;
  return section.childLayout;
}

function freeformParentContains(
  parentSectionId: string,
  regions: readonly WorkspaceExternalDropFreeformRegion[],
  position: WorkspacePoint,
): boolean {
  const region = regions.find((candidate) => candidate.parentSectionId === parentSectionId);
  if (!region) {
    throw new Error(`External-drop freeform geometry for ${parentSectionId} is unavailable.`);
  }
  return pointInsideRect(position, region.workspaceRect);
}

function pointInsideRect(point: WorkspacePoint, rect: WorkspaceRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function freeformPosition(
  parentSectionId: string | null,
  freeformRegions: readonly WorkspaceExternalDropFreeformRegion[],
  position: WorkspacePoint,
): WorkspacePoint {
  if (parentSectionId === null) {
    return Object.freeze({ ...position });
  }
  const region = freeformRegions.find((candidate) => candidate.parentSectionId === parentSectionId);
  if (!region) {
    throw new Error(`External-drop freeform geometry for ${parentSectionId} is unavailable.`);
  }
  return Object.freeze({
    x: Math.max(0, position.x - region.surfaceWorkspaceRect.x),
    y: Math.max(0, position.y - region.surfaceWorkspaceRect.y),
  });
}

export function resolveWorkspaceExternalDropCandidate<TSectionData = WorkspaceJsonValue>(
  document: WorkspaceDocument<TSectionData>,
  geometryIndex: WorkspaceGeometryIndex,
  registry: WorkspaceSectionRegistry<TSectionData>,
  position: WorkspacePoint,
  freeformRegions: readonly WorkspaceExternalDropFreeformRegion[],
): WorkspaceExternalDropCandidate {
  const parentSectionId = containingParent(
    document,
    geometryIndex,
    freeformRegions,
    registry,
    position,
  );
  const childLayout = parentSectionId ? document.sections[parentSectionId]?.childLayout : null;
  return Object.freeze({
    parentSectionId,
    placement: Object.freeze(
      childLayout?.positioning === "ordered"
        ? {
            index: insertionIndexForParent(
              document,
              geometryIndex,
              parentSectionId as string,
              position,
            ),
            type: "ordered" as const,
          }
        : {
            position: freeformPosition(parentSectionId, freeformRegions, position),
            type: "freeform" as const,
          },
    ),
  });
}

export function workspaceExternalDropDefaultLabel<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  candidate: WorkspaceExternalDropCandidate,
): string {
  if (candidate.parentSectionId === null) {
    return "Drop on canvas";
  }
  const parent = document.sections[candidate.parentSectionId];
  if (!parent) {
    throw new Error(`External-drop candidate ${candidate.parentSectionId} is missing.`);
  }
  return `Drop into ${parent.title}`;
}

function allowedExternalDropDecision(
  decision: Record<string, unknown>,
): WorkspaceExternalDropDecision {
  if (Object.hasOwn(decision, "reason")) {
    throw new TypeError("An allowed workspace external drop cannot provide a reason.");
  }
  if (decision.label === undefined) {
    return Object.freeze({ allowed: true });
  }
  if (typeof decision.label !== "string" || decision.label.trim().length === 0) {
    throw new TypeError("Workspace external-drop decision label must be a non-empty string.");
  }
  return Object.freeze({ allowed: true, label: decision.label.trim() });
}

function rejectedExternalDropDecision(
  decision: Record<string, unknown>,
): WorkspaceExternalDropDecision {
  if (Object.hasOwn(decision, "label")) {
    throw new TypeError("A rejected workspace external drop cannot provide a label.");
  }
  if (typeof decision.reason !== "string" || decision.reason.trim().length === 0) {
    throw new TypeError("Workspace external-drop rejection reason must be a non-empty string.");
  }
  return Object.freeze({ allowed: false, reason: decision.reason.trim() });
}

export function resolveWorkspaceExternalDropDecision(
  value: WorkspaceExternalDropDecision,
): WorkspaceExternalDropDecision {
  const decision = optionOverridesAt(
    value,
    decisionKeys,
    "Workspace external-drop decision",
    "workspace external-drop decision field",
  );
  if (typeof decision.allowed !== "boolean") {
    throw new TypeError("Workspace external-drop decision allowed must be a boolean.");
  }
  if (decision.allowed) {
    return allowedExternalDropDecision(decision);
  }
  return rejectedExternalDropDecision(decision);
}
