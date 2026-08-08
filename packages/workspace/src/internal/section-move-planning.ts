import type { InteractionPoint } from "./interaction-geometry.js";
import {
  resolveSelectionBlock,
  selectionContainsSectionOrAncestor,
  type SectionHierarchySnapshot,
  type SelectionBlock,
} from "./selection-planning.js";

export type SectionMoveMode = "free" | "sort";

export type SectionMovePlan = {
  sectionIds: readonly string[];
  mode: SectionMoveMode;
  sourceParentId: string | null;
  destinationParentId: string | null;
  destinationIndex: number;
  topLevelPositions: Readonly<Record<string, InteractionPoint>> | null;
};

export type SectionMoveDestination = {
  parentId: string | null;
  index: number;
  topLevelPositions: Readonly<Record<string, InteractionPoint>> | null;
};

export type SectionMoveDecision =
  | { status: "planned"; plan: SectionMovePlan }
  | { status: "cancelled" }
  | { status: "unchanged" }
  | { status: "rejected"; reason: string };

export type AppliedHierarchy = SectionHierarchySnapshot;

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
  mode: SectionMoveMode;
  selectedIds: readonly string[];
  validate?: (plan: SectionMovePlan) => { allowed: true } | { allowed: false; reason: string };
}): SectionMoveDecision {
  if (cancelled) {
    return { status: "cancelled" };
  }
  if (!destination) {
    return { status: "rejected", reason: "A move destination is required." };
  }

  const selectionResult = resolveSelectionBlock(selectedIds, hierarchy);
  if (!selectionResult.allowed) {
    return { status: "rejected", reason: selectionResult.reason };
  }
  const validationReason = validateMoveRequest(mode, selectionResult.block, destination, hierarchy);
  if (validationReason) {
    return { status: "rejected", reason: validationReason };
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
  if (hierarchiesEqual(hierarchy, applySectionMovePlan(hierarchy, plan))) {
    return { status: "unchanged" };
  }
  const hostDecision = validate?.(plan) ?? { allowed: true };
  return hostDecision.allowed
    ? { status: "planned", plan }
    : { status: "rejected", reason: hostDecision.reason };
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
  mode: SectionMoveMode,
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
  mode: SectionMoveMode,
  sourceParentId: string | null,
  destinationParentId: string | null,
): string | null {
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
  for (const sectionId of sectionIds) {
    const position = destination.topLevelPositions[sectionId];
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return `Canvas destination is missing a finite position for "${sectionId}".`;
    }
  }
  return null;
}

function createPlan(
  mode: SectionMoveMode,
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
  current: Readonly<Record<string, InteractionPoint>>,
  plan: SectionMovePlan,
): Readonly<Record<string, InteractionPoint>> {
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

function hierarchiesEqual(
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
  left: Readonly<Record<string, InteractionPoint>>,
  right: Readonly<Record<string, InteractionPoint>>,
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
