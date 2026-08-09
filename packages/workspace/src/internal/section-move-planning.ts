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

export type SectionMovePlacement =
  | Readonly<{ index: number; type: "ordered" }>
  | Readonly<{
      positions: Readonly<Record<string, WorkspacePoint>>;
      type: "freeform";
    }>;

export type SectionMoveDestination = Readonly<{
  parentId: string | null;
  placement: SectionMovePlacement;
}>;

export type SectionMovePlan = {
  sectionIds: readonly string[];
  mode: WorkspaceSectionMoveMode;
  sourceParentIds: readonly (string | null)[];
  destination: SectionMoveDestination;
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

function snapshotPositions(
  positions: Readonly<Record<string, WorkspacePoint>>,
): Readonly<Record<string, WorkspacePoint>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(positions).map(([sectionId, position]) => [
        sectionId,
        Object.freeze({ x: position.x, y: position.y }),
      ]),
    ),
  );
}

function snapshotDestination(destination: SectionMoveDestination): SectionMoveDestination {
  return Object.freeze({
    parentId: destination.parentId,
    placement: Object.freeze(
      destination.placement.type === "ordered"
        ? { index: destination.placement.index, type: "ordered" as const }
        : {
            positions: snapshotPositions(destination.placement.positions),
            type: "freeform" as const,
          },
    ),
  });
}

function snapshotSectionMovePlan(plan: SectionMovePlan): SectionMovePlan {
  return Object.freeze({
    destination: snapshotDestination(plan.destination),
    mode: plan.mode,
    sectionIds: Object.freeze([...plan.sectionIds]),
    sourceParentIds: Object.freeze([...plan.sourceParentIds]),
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
  const placement =
    plan.destination.placement.type === "freeform"
      ? [
          "freeform",
          Object.entries(plan.destination.placement.positions)
            .sort(([leftId], [rightId]) => (leftId < rightId ? -1 : leftId > rightId ? 1 : 0))
            .map(([sectionId, position]) => [sectionId, position.x, position.y] as const),
        ]
      : ["ordered", plan.destination.placement.index];
  return JSON.stringify([
    plan.mode,
    plan.sourceParentIds,
    plan.destination.parentId,
    placement,
    plan.sectionIds,
  ]);
}

export function sectionMovePlansEqual(left: SectionMovePlan, right: SectionMovePlan): boolean {
  return (
    left.mode === right.mode &&
    arraysEqual(left.sourceParentIds, right.sourceParentIds) &&
    arraysEqual(left.sectionIds, right.sectionIds) &&
    destinationsEqual(left.destination, right.destination)
  );
}

function destinationsEqual(left: SectionMoveDestination, right: SectionMoveDestination): boolean {
  if (left.parentId !== right.parentId || left.placement.type !== right.placement.type) {
    return false;
  }
  return left.placement.type === "ordered" && right.placement.type === "ordered"
    ? left.placement.index === right.placement.index
    : left.placement.type === "freeform" && right.placement.type === "freeform"
      ? positionRecordsEqual(left.placement.positions, right.placement.positions)
      : false;
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
  if (
    plan.destination.placement.type === "ordered" &&
    sectionHierarchySnapshotsEqual(hierarchy, applySectionMovePlan(hierarchy, plan))
  ) {
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
  const sourceParents = new Set(plan.sourceParentIds);
  const sourceOrders = new Map(
    [...sourceParents].map((parentId) => [
      parentId,
      removeIds(getChildOrder(hierarchy, parentId), plan.sectionIds),
    ]),
  );
  const destinationParentId = plan.destination.parentId;
  const destinationBase =
    sourceOrders.get(destinationParentId) ??
    removeIds(getChildOrder(hierarchy, destinationParentId), plan.sectionIds);
  const destinationOrder = resolveDestinationOrder(
    destinationBase,
    getChildOrder(hierarchy, destinationParentId),
    plan,
  );

  const rootSectionIds = resolveNextRoots(
    hierarchy.rootSectionIds,
    sourceOrders.get(null) ?? hierarchy.rootSectionIds,
    destinationOrder,
    plan,
  );
  const childrenByParent = resolveNextChildren(
    hierarchy.childrenByParent,
    sourceOrders,
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

function resolveDestinationOrder(
  destinationBase: readonly string[],
  currentOrder: readonly string[],
  plan: SectionMovePlan,
): readonly string[] {
  if (plan.destination.placement.type === "ordered") {
    return insertIds(destinationBase, plan.destination.placement.index, plan.sectionIds);
  }
  const sameParent = plan.sourceParentIds.every(
    (parentId) => parentId === plan.destination.parentId,
  );
  return sameParent ? currentOrder.slice() : [...destinationBase, ...plan.sectionIds];
}

function validateMoveRequest(
  mode: WorkspaceSectionMoveMode,
  block: SelectionBlock,
  destination: SectionMoveDestination,
  hierarchy: SectionHierarchySnapshot,
): string | null {
  const modeReason = validateMode(mode, block.sourceParentIds, destination.parentId);
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
  return validateDestinationPlacement(block.sectionIds, destination, hierarchy);
}

function validateMode(
  mode: WorkspaceSectionMoveMode,
  sourceParentIds: readonly (string | null)[],
  destinationParentId: string | null,
): string | null {
  if (mode !== "free" && mode !== "sort") {
    return "Section movement mode must be sort or free.";
  }
  if (mode !== "sort") {
    return null;
  }
  const uniqueParents = new Set(sourceParentIds);
  if (uniqueParents.size !== 1) {
    return "Sorting mode requires selected sections to share one nested parent.";
  }
  const sourceParentId = sourceParentIds[0] ?? null;
  if (!sourceParentId) {
    return "Top-level sections are spatial and cannot use sorting mode.";
  }
  return sourceParentId === destinationParentId
    ? null
    : "Sorting mode cannot change a section's parent.";
}

function validateDestinationPlacement(
  sectionIds: readonly string[],
  destination: SectionMoveDestination,
  hierarchy: SectionHierarchySnapshot,
): string | null {
  if (destination.placement.type === "ordered") {
    if (destination.parentId === null) {
      return "Canvas destinations require freeform positions.";
    }
    const destinationCount = removeIds(
      getChildOrder(hierarchy, destination.parentId),
      sectionIds,
    ).length;
    if (!Number.isInteger(destination.placement.index) || destination.placement.index < 0) {
      return "The destination index must be a non-negative integer.";
    }
    return destination.placement.index > destinationCount
      ? `The destination index exceeds the ${destinationCount}-section destination.`
      : null;
  }
  return validateFreeformPositions(
    sectionIds,
    destination.parentId,
    destination.placement.positions,
  );
}

function validateFreeformPositions(
  sectionIds: readonly string[],
  parentId: string | null,
  positions: Readonly<Record<string, WorkspacePoint>>,
): string | null {
  if (!positionIdsMatch(sectionIds, positions)) {
    return "Freeform destinations may only include positions for the moved sections.";
  }
  for (const sectionId of sectionIds) {
    const position = positions[sectionId];
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return `Freeform destination is missing a finite position for "${sectionId}".`;
    }
    if (parentId !== null && (position.x < 0 || position.y < 0)) {
      return `Nested freeform destination position for "${sectionId}" must be non-negative.`;
    }
  }
  return null;
}

function positionIdsMatch(
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
    destination,
    sectionIds: block.sectionIds,
    mode,
    sourceParentIds: block.sourceParentIds,
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

function copyRecord<T>(current: Readonly<Record<string, T>>): Record<string, T> {
  return Object.assign(Object.create(null) as Record<string, T>, current);
}

function resolveNextRoots(
  currentRoots: readonly string[],
  sourceOrder: readonly string[],
  destinationOrder: readonly string[],
  plan: SectionMovePlan,
): readonly string[] {
  const sourceParents = new Set(plan.sourceParentIds);
  if (sourceParents.size === 1 && sourceParents.has(null) && plan.destination.parentId === null) {
    return currentRoots.slice();
  }
  if (plan.destination.parentId === null) {
    return destinationOrder;
  }
  return sourceParents.has(null) ? sourceOrder : currentRoots.slice();
}

function resolveNextChildren(
  current: Readonly<Record<string, readonly string[]>>,
  sourceOrders: ReadonlyMap<string | null, readonly string[]>,
  destinationOrder: readonly string[],
  plan: SectionMovePlan,
): Readonly<Record<string, readonly string[]>> {
  const next = copyRecord(current);
  for (const [parentId, sourceOrder] of sourceOrders) {
    if (parentId) {
      next[parentId] = sourceOrder;
    }
  }
  if (plan.destination.parentId) {
    next[plan.destination.parentId] = destinationOrder;
  }
  return next;
}

function resolveNextParents(
  current: Readonly<Record<string, string | null>>,
  plan: SectionMovePlan,
): Readonly<Record<string, string | null>> {
  const next = copyRecord(current);
  for (const sectionId of plan.sectionIds) {
    next[sectionId] = plan.destination.parentId;
  }
  return next;
}

function resolveNextRootPositions(
  current: Readonly<Record<string, WorkspacePoint>>,
  plan: SectionMovePlan,
): Readonly<Record<string, WorkspacePoint>> {
  const next = copyRecord(current);
  for (const sectionId of plan.sectionIds) {
    if (plan.destination.parentId === null && plan.destination.placement.type === "freeform") {
      const position = plan.destination.placement.positions[sectionId];
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

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
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
