import type { WorkspaceDocument, WorkspaceJsonValue, WorkspacePoint } from "../core.js";
import type { WorkspaceGeometryIndex } from "./geometry-index.js";
import { optionOverridesAt } from "./runtime-option-validation.js";
import type {
  WorkspaceExternalDropCandidate,
  WorkspaceExternalDropDecision,
} from "./workspace-react-contract.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";

const decisionKeys = ["allowed", "label", "reason"] as const;

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
  registry: WorkspaceSectionRegistry<TSectionData>,
  position: WorkspacePoint,
): string | null {
  for (const frame of geometryIndex.framesAt(position)) {
    const section = document.sections[frame.sectionId];
    const definition = section ? registry.definition(section.kind) : undefined;
    if (section?.childLayout?.positioning === "ordered" && definition?.canContainSections) {
      return section.id;
    }
  }
  return null;
}

export function resolveWorkspaceExternalDropCandidate<TSectionData = WorkspaceJsonValue>(
  document: WorkspaceDocument<TSectionData>,
  geometryIndex: WorkspaceGeometryIndex,
  registry: WorkspaceSectionRegistry<TSectionData>,
  position: WorkspacePoint,
): WorkspaceExternalDropCandidate {
  const parentSectionId = containingParent(document, geometryIndex, registry, position);
  return Object.freeze({
    insertionIndex:
      parentSectionId === null
        ? document.rootSections.length
        : insertionIndexForParent(document, geometryIndex, parentSectionId, position),
    parentSectionId,
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
