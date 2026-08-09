import type { WorkspaceDocument, WorkspaceJsonValue, WorkspacePoint } from "../core.js";
import { optionOverridesAt } from "./runtime-option-validation.js";
import {
  resolveSelectionBlock,
  selectionContainsSectionOrAncestor,
  type SectionHierarchySnapshot,
  type SelectionBlock,
  type SelectionBlockRejectionCode,
} from "./selection-planning.js";

export type WorkspaceSectionMoveMode = "free" | "sort";

export type SectionMovePlan = {
  sectionIds: readonly string[];
  mode: WorkspaceSectionMoveMode;
  sourceParentId: string | null;
  destinationParentId: string | null;
  destinationIndex: number;
  topLevelPositions: Readonly<Record<string, WorkspacePoint>> | null;
};

export type SectionMoveDestination = {
  parentId: string | null;
  index: number;
  topLevelPositions: Readonly<Record<string, WorkspacePoint>> | null;
};

export type WorkspaceSectionMoveDecision =
  Readonly<{ allowed: false; reason: string }> | Readonly<{ allowed: true }>;

export type WorkspaceSectionMoveValidationRequest<TSectionData = WorkspaceJsonValue> = Readonly<{
  document: WorkspaceDocument<TSectionData>;
  plan: SectionMovePlan;
}>;

export type WorkspaceSectionMoveValidator<TSectionData = WorkspaceJsonValue> = (
  request: WorkspaceSectionMoveValidationRequest<TSectionData>,
) => WorkspaceSectionMoveDecision;

export type SectionMoveRejectionCode = SelectionBlockRejectionCode | "host-policy" | "invalid-move";

export type SectionMoveDecision =
  | { status: "planned"; plan: SectionMovePlan }
  | { status: "cancelled" }
  | { status: "unchanged"; plan: SectionMovePlan }
  | { status: "rejected"; code: SectionMoveRejectionCode; reason: string };

export type AppliedHierarchy = SectionHierarchySnapshot;

const sectionMoveDecisionKeys = ["allowed", "reason"] as const;

export function resolveWorkspaceSectionMoveDecision(
  value: WorkspaceSectionMoveDecision,
): WorkspaceSectionMoveDecision {
  const decision = optionOverridesAt(
    value,
    sectionMoveDecisionKeys,
    "Workspace section-move decision",
    "workspace section-move decision field",
  );
  if (typeof decision.allowed !== "boolean") {
    throw new TypeError("Workspace section-move decision allowed must be a boolean.");
  }
  if (decision.allowed) {
    if (Object.hasOwn(decision, "reason")) {
      throw new TypeError("An allowed workspace section move cannot provide a reason.");
    }
    return Object.freeze({ allowed: true });
  }
  if (typeof decision.reason !== "string" || decision.reason.trim().length === 0) {
    throw new TypeError("Workspace section-move rejection reason must be a non-empty string.");
  }
  return Object.freeze({ allowed: false, reason: decision.reason.trim() });
}

function snapshotTopLevelPositions(
  positions: Readonly<Record<string, WorkspacePoint>> | null,
): Readonly<Record<string, WorkspacePoint>> | null {
  if (!positions) {
    return null;
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(positions).map(([sectionId, position]) => [
        sectionId,
        Object.freeze({ x: position.x, y: position.y }),
      ]),
    ),
  );
}

function snapshotSectionMovePlan(plan: SectionMovePlan): SectionMovePlan {
  return Object.freeze({
    ...plan,
    sectionIds: Object.freeze([...plan.sectionIds]),
    topLevelPositions: snapshotTopLevelPositions(plan.topLevelPositions),
  });
}

export function validateWorkspaceSectionMovePlan<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  plan: SectionMovePlan,
  validator: WorkspaceSectionMoveValidator<TSectionData> | undefined,
): WorkspaceSectionMoveDecision {
  if (!validator) {
    return Object.freeze({ allowed: true });
  }
  return resolveWorkspaceSectionMoveDecision(
    validator(
      Object.freeze({
        document,
        plan: snapshotSectionMovePlan(plan),
      }),
    ),
  );
}

export function serializeSectionMovePlan(plan: SectionMovePlan): string {
  const positions = plan.topLevelPositions
    ? Object.entries(plan.topLevelPositions)
        .sort(([leftId], [rightId]) => (leftId < rightId ? -1 : leftId > rightId ? 1 : 0))
        .map(([sectionId, position]) => [sectionId, position.x, position.y] as const)
    : null;
  return JSON.stringify([
    plan.mode,
    plan.sourceParentId,
    plan.destinationParentId,
    plan.destinationIndex,
    plan.sectionIds,
    positions,
  ]);
}

export function sectionMovePlansEqual(left: SectionMovePlan, right: SectionMovePlan): boolean {
  return (
    left.mode === right.mode &&
    left.sourceParentId === right.sourceParentId &&
    left.destinationParentId === right.destinationParentId &&
    left.destinationIndex === right.destinationIndex &&
    arraysEqual(left.sectionIds, right.sectionIds) &&
    positionRecordsEqual(left.topLevelPositions ?? {}, right.topLevelPositions ?? {}) &&
    (left.topLevelPositions === null) === (right.topLevelPositions === null)
  );
}

export function planSectionMove({
  cancelled = false,
  destination,
  hierarchy,
  mode,
  selectedIds,
  validate,
}: {
  cancelled?: boolean;
  destination: SectionMoveDestination | null;
  hierarchy: SectionHierarchySnapshot;
  mode: WorkspaceSectionMoveMode;
  selectedIds: readonly string[];
  validate?: (plan: SectionMovePlan) => { allowed: true } | { allowed: false; reason: string };
}): SectionMoveDecision {
  if (cancelled) {
    return { status: "cancelled" };
  }
  if (!destination) {
    return {
      status: "rejected",
      code: "invalid-move",
      reason: "A move destination is required.",
    };
  }

  const selectionResult = resolveSelectionBlock(selectedIds, hierarchy);
  if (!selectionResult.allowed) {
    return {
      status: "rejected",
      code: selectionResult.code,
      reason: selectionResult.reason,
    };
  }
  const validationReason = validateMoveRequest(mode, selectionResult.block, destination, hierarchy);
  if (validationReason) {
    return { status: "rejected", code: "invalid-move", reason: validationReason };
  }

  const plan = createPlan(mode, selectionResult.block, destination);
  return evaluatePlan(hierarchy, plan, validate);
}

function evaluatePlan(
  hierarchy: SectionHierarchySnapshot,
  plan: SectionMovePlan,
  validate:
    ((plan: SectionMovePlan) => { allowed: true } | { allowed: false; reason: string }) | undefined,
): SectionMoveDecision {
  if (sectionHierarchySnapshotsEqual(hierarchy, applySectionMovePlan(hierarchy, plan))) {
    return { status: "unchanged", plan };
  }
  const hostDecision = validate?.(plan) ?? { allowed: true };
  return hostDecision.allowed
    ? { status: "planned", plan }
    : { status: "rejected", code: "host-policy", reason: hostDecision.reason };
}

export function applySectionMovePlan(
  hierarchy: SectionHierarchySnapshot,
  plan: SectionMovePlan,
): AppliedHierarchy {
  const sourceOrder = getChildOrder(hierarchy, plan.sourceParentId);
  const sourceWithoutSelection = removeIds(sourceOrder, plan.sectionIds);
  const destinationBase =
    plan.sourceParentId === plan.destinationParentId
      ? sourceWithoutSelection
      : removeIds(getChildOrder(hierarchy, plan.destinationParentId), plan.sectionIds);
  const destinationOrder = insertIds(destinationBase, plan.destinationIndex, plan.sectionIds);

  const rootSectionIds = resolveNextRoots(
    hierarchy.rootSectionIds,
    sourceWithoutSelection,
    destinationOrder,
    plan,
  );
  const childrenByParent = resolveNextChildren(
    hierarchy.childrenByParent,
    sourceWithoutSelection,
    destinationOrder,
    plan,
  );
  return {
    rootSectionIds,
    childrenByParent,
    parentByChild: resolveNextParents(hierarchy.parentByChild, plan),
    rootPositions: resolveNextRootPositions(hierarchy.rootPositions, plan),
  };
}

function validateMoveRequest(
  mode: WorkspaceSectionMoveMode,
  block: SelectionBlock,
  destination: SectionMoveDestination,
  hierarchy: SectionHierarchySnapshot,
): string | null {
  const modeReason = validateMode(mode, block.sourceParentId, destination.parentId);
  if (modeReason) {
    return modeReason;
  }
  if (destination.parentId && !Object.hasOwn(hierarchy.parentByChild, destination.parentId)) {
    return `Destination parent "${destination.parentId}" is not in the hierarchy.`;
  }
  if (
    destination.parentId &&
    selectionContainsSectionOrAncestor(
      destination.parentId,
      new Set(block.sectionIds),
      hierarchy.parentByChild,
    )
  ) {
    return "A section cannot move into itself or one of its descendants.";
  }
  const destinationCount = removeIds(
    getChildOrder(hierarchy, destination.parentId),
    block.sectionIds,
  ).length;
  if (!Number.isInteger(destination.index) || destination.index < 0) {
    return "The destination index must be a non-negative integer.";
  }
  if (destination.index > destinationCount) {
    return `The destination index exceeds the ${destinationCount}-section destination.`;
  }
  return validateTopLevelPositions(block.sectionIds, destination);
}

function validateMode(
  mode: WorkspaceSectionMoveMode,
  sourceParentId: string | null,
  destinationParentId: string | null,
): string | null {
  if (mode !== "free" && mode !== "sort") {
    return "Section movement mode must be sort or free.";
  }
  if (mode !== "sort") {
    return null;
  }
  if (!sourceParentId) {
    return "Top-level sections are spatial and cannot use sorting mode.";
  }
  return sourceParentId === destinationParentId
    ? null
    : "Sorting mode cannot change a section's parent.";
}

function validateTopLevelPositions(
  sectionIds: readonly string[],
  destination: SectionMoveDestination,
): string | null {
  if (destination.parentId !== null) {
    return destination.topLevelPositions === null
      ? null
      : "Nested destinations cannot include top-level positions.";
  }
  if (!destination.topLevelPositions) {
    return "Canvas destinations require a position for every moved section.";
  }
  if (!topLevelPositionIdsMatch(sectionIds, destination.topLevelPositions)) {
    return "Canvas destinations may only include positions for the moved sections.";
  }
  for (const sectionId of sectionIds) {
    const position = destination.topLevelPositions[sectionId];
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return `Canvas destination is missing a finite position for "${sectionId}".`;
    }
  }
  return null;
}

function topLevelPositionIdsMatch(
  sectionIds: readonly string[],
  positions: Readonly<Record<string, WorkspacePoint>>,
): boolean {
  const expectedSectionIds = new Set(sectionIds);
  const positionIds = Object.keys(positions);
  return (
    positionIds.length === expectedSectionIds.size &&
    positionIds.every((sectionId) => expectedSectionIds.has(sectionId))
  );
}

function createPlan(
  mode: WorkspaceSectionMoveMode,
  block: SelectionBlock,
  destination: SectionMoveDestination,
): SectionMovePlan {
  return {
    sectionIds: block.sectionIds,
    mode,
    sourceParentId: block.sourceParentId,
    destinationParentId: destination.parentId,
    destinationIndex: destination.index,
    topLevelPositions: destination.topLevelPositions,
  };
}

function getChildOrder(
  hierarchy: SectionHierarchySnapshot,
  parentId: string | null,
): readonly string[] {
  return parentId ? (hierarchy.childrenByParent[parentId] ?? []) : hierarchy.rootSectionIds;
}

function removeIds(ids: readonly string[], removedIds: readonly string[]): readonly string[] {
  const removedSet = new Set(removedIds);
  return ids.filter((id) => !removedSet.has(id));
}

function insertIds(
  ids: readonly string[],
  index: number,
  insertedIds: readonly string[],
): readonly string[] {
  return [...ids.slice(0, index), ...insertedIds, ...ids.slice(index)];
}

function resolveNextRoots(
  currentRoots: readonly string[],
  sourceOrder: readonly string[],
  destinationOrder: readonly string[],
  plan: SectionMovePlan,
): readonly string[] {
  if (plan.sourceParentId === null && plan.destinationParentId === null) {
    return currentRoots.slice();
  }
  if (plan.destinationParentId === null) {
    return destinationOrder;
  }
  return plan.sourceParentId === null ? sourceOrder : currentRoots.slice();
}

function resolveNextChildren(
  current: Readonly<Record<string, readonly string[]>>,
  sourceOrder: readonly string[],
  destinationOrder: readonly string[],
  plan: SectionMovePlan,
): Readonly<Record<string, readonly string[]>> {
  const next = { ...current };
  if (plan.sourceParentId) {
    next[plan.sourceParentId] = sourceOrder;
  }
  if (plan.destinationParentId) {
    next[plan.destinationParentId] = destinationOrder;
  }
  return next;
}

function resolveNextParents(
  current: Readonly<Record<string, string | null>>,
  plan: SectionMovePlan,
): Readonly<Record<string, string | null>> {
  const next = { ...current };
  for (const sectionId of plan.sectionIds) {
    next[sectionId] = plan.destinationParentId;
  }
  return next;
}

function resolveNextRootPositions(
  current: Readonly<Record<string, WorkspacePoint>>,
  plan: SectionMovePlan,
): Readonly<Record<string, WorkspacePoint>> {
  const next = { ...current };
  for (const sectionId of plan.sectionIds) {
    if (plan.topLevelPositions) {
      const position = plan.topLevelPositions[sectionId];
      if (position) {
        next[sectionId] = position;
      }
    } else {
      delete next[sectionId];
    }
  }
  return next;
}

export function sectionHierarchySnapshotsEqual(
  left: SectionHierarchySnapshot,
  right: SectionHierarchySnapshot,
): boolean {
  return (
    arraysEqual(left.rootSectionIds, right.rootSectionIds) &&
    childrenRecordsEqual(left.childrenByParent, right.childrenByParent) &&
    parentRecordsEqual(left.parentByChild, right.parentByChild) &&
    positionRecordsEqual(left.rootPositions, right.rootPositions)
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function childrenRecordsEqual(
  left: Readonly<Record<string, readonly string[]>>,
  right: Readonly<Record<string, readonly string[]>>,
): boolean {
  const keys = Object.keys(left);
  return (
    recordKeysEqual(keys, right) &&
    keys.every((key) => arraysEqual(left[key] ?? [], right[key] ?? []))
  );
}

function parentRecordsEqual(
  left: Readonly<Record<string, string | null>>,
  right: Readonly<Record<string, string | null>>,
): boolean {
  const keys = Object.keys(left);
  return recordKeysEqual(keys, right) && keys.every((key) => left[key] === right[key]);
}

function positionRecordsEqual(
  left: Readonly<Record<string, WorkspacePoint>>,
  right: Readonly<Record<string, WorkspacePoint>>,
): boolean {
  const keys = Object.keys(left);
  return (
    recordKeysEqual(keys, right) &&
    keys.every((key) => {
      const leftPosition = left[key];
      const rightPosition = right[key];
      return leftPosition?.x === rightPosition?.x && leftPosition?.y === rightPosition?.y;
    })
  );
}

function recordKeysEqual(
  leftKeys: readonly string[],
  right: Readonly<Record<string, unknown>>,
): boolean {
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => Object.hasOwn(right, key))
  );
}
