import {
  deriveWorkspaceParentLookup,
  type WorkspaceActionRejectionReason,
  type WorkspaceDocument,
  type WorkspaceFreeformChildLayout,
  type WorkspacePoint,
  type WorkspaceSection,
} from "../core.js";
import {
  applySectionMovePlan,
  planSectionMove,
  sectionHierarchySnapshotsEqual,
  sectionMovePlansEqual,
  type SectionMovePlan,
} from "./section-move-planning.js";
import type { SectionHierarchySnapshot } from "./selection-planning.js";

export type WorkspaceSectionMoveApplication<TSectionData> =
  | Readonly<{ document: WorkspaceDocument<TSectionData>; status: "applied" }>
  | Readonly<{ status: "unchanged" }>
  | Readonly<{ reason: WorkspaceActionRejectionReason; status: "rejected" }>;

function recordFromEntries<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) {
    record[key] = value;
  }
  return record;
}

function workspaceChildrenByParent<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
): Readonly<Record<string, readonly string[]>> {
  return recordFromEntries(
    Object.values(document.sections)
      .filter((section) => section.childLayout !== null)
      .map((section) => [section.id, section.childLayout?.sectionIds ?? []] as const),
  );
}

function workspaceRootPositions<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
): Readonly<Record<string, WorkspacePoint>> {
  return recordFromEntries(
    document.rootSections.map(({ position, sectionId }) => [sectionId, position] as const),
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

export function workspaceSectionHierarchySnapshot<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
): SectionHierarchySnapshot {
  return {
    childrenByParent: workspaceChildrenByParent(document),
    parentByChild: recordFromEntries(deriveWorkspaceParentLookup(document)),
    rootPositions: workspaceRootPositions(document),
    rootSectionIds: document.rootSections.map(({ sectionId }) => sectionId),
  };
}

export function workspaceDocumentMatchesSectionMove<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sourceDocument: WorkspaceDocument<TSectionData>,
  plan: SectionMovePlan,
): boolean {
  const result = applyWorkspaceSectionMove(sourceDocument, plan);
  const expected = result.status === "applied" ? result.document : sourceDocument;
  return workspaceMovementStateMatches(document, expected);
}

function workspaceMovementStateMatches<TSectionData>(
  left: WorkspaceDocument<TSectionData>,
  right: WorkspaceDocument<TSectionData>,
): boolean {
  if (
    !sectionHierarchySnapshotsEqual(
      workspaceSectionHierarchySnapshot(left),
      workspaceSectionHierarchySnapshot(right),
    )
  ) {
    return false;
  }
  return Object.keys(right.sections).every((sectionId) => {
    const leftLayout = left.sections[sectionId]?.childLayout;
    const rightLayout = right.sections[sectionId]?.childLayout;
    if (leftLayout?.positioning !== "freeform" || rightLayout?.positioning !== "freeform") {
      return leftLayout?.positioning === rightLayout?.positioning;
    }
    return positionsMatch(leftLayout.positions, rightLayout.positions);
  });
}

function positionsMatch(
  left: Readonly<Record<string, WorkspacePoint>>,
  right: Readonly<Record<string, WorkspacePoint>>,
): boolean {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (sectionId) =>
        left[sectionId]?.x === right[sectionId]?.x && left[sectionId]?.y === right[sectionId]?.y,
    )
  );
}

function movedSections<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  hierarchy: SectionHierarchySnapshot,
  plan: SectionMovePlan,
): Readonly<Record<string, WorkspaceSection<TSectionData>>> {
  const changedParentIds = new Set(
    [...plan.sourceParentIds, plan.destination.parentId].filter(
      (sectionId): sectionId is string => sectionId !== null,
    ),
  );
  if (changedParentIds.size === 0) {
    return document.sections;
  }
  const entries = Object.entries(document.sections).map(([sectionId, section]) => {
    const childLayout = section.childLayout;
    if (!childLayout || !changedParentIds.has(sectionId)) {
      return [sectionId, section] as const;
    }
    const sectionIds = hierarchy.childrenByParent[sectionId] ?? [];
    const nextLayout =
      childLayout.positioning === "ordered"
        ? { ...childLayout, sectionIds }
        : {
            ...childLayout,
            positions: Object.fromEntries(
              sectionIds.map((childId) => [
                childId,
                destinationFreeformPosition(plan, sectionId, childId) ??
                  requiredFreeformPosition(childLayout, childId),
              ]),
            ),
            sectionIds,
          };
    const unchanged =
      arraysMatch(childLayout.sectionIds, sectionIds) &&
      (childLayout.positioning === "ordered" ||
        (nextLayout.positioning === "freeform" &&
          positionsMatch(childLayout.positions, nextLayout.positions)));
    return unchanged
      ? ([sectionId, section] as const)
      : ([sectionId, { ...section, childLayout: nextLayout }] as const);
  });
  return entries.every(([sectionId, section]) => section === document.sections[sectionId])
    ? document.sections
    : Object.fromEntries(entries);
}

function arraysMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function destinationFreeformPosition(
  plan: SectionMovePlan,
  parentSectionId: string,
  childSectionId: string,
): WorkspacePoint | null {
  if (
    plan.destination.parentId !== parentSectionId ||
    plan.destination.placement.type !== "freeform"
  ) {
    return null;
  }
  return plan.destination.placement.positions[childSectionId] ?? null;
}

function movedRootSections<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  hierarchy: SectionHierarchySnapshot,
) {
  const currentById = new Map(document.rootSections.map((entry) => [entry.sectionId, entry]));
  const next = hierarchy.rootSectionIds.map((sectionId) => {
    const position = hierarchy.rootPositions[sectionId];
    if (!position) {
      throw new Error(`Moved root section ${sectionId} is missing its canonical position.`);
    }
    const current = currentById.get(sectionId);
    if (current && current.position.x === position.x && current.position.y === position.y) {
      return current;
    }
    return { position, sectionId };
  });
  return next.length === document.rootSections.length &&
    next.every((entry, index) => entry === document.rootSections[index])
    ? document.rootSections
    : next;
}

function destinationCanContainSections<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  parentSectionId: string | null,
): boolean {
  return parentSectionId === null || Boolean(document.sections[parentSectionId]?.childLayout);
}

function directMoveRejection<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  plan: SectionMovePlan,
): WorkspaceActionRejectionReason | null {
  if (plan.sectionIds.some((sectionId) => !Object.hasOwn(document.sections, sectionId))) {
    return "section-move-invalid";
  }
  if (!destinationCanContainSections(document, plan.destination.parentId)) {
    return "section-not-container";
  }
  if (!destinationPlacementMatches(document, plan)) {
    return "section-layout-unsupported";
  }
  return plan.sectionIds.some((sectionId) => document.sections[sectionId]?.positionAndSizeLocked)
    ? "section-locked"
    : null;
}

function destinationPlacementMatches<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  plan: SectionMovePlan,
): boolean {
  if (plan.destination.parentId === null) {
    return plan.destination.placement.type === "freeform";
  }
  return (
    document.sections[plan.destination.parentId]?.childLayout?.positioning ===
    plan.destination.placement.type
  );
}

export function applyWorkspaceSectionMove<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  plan: SectionMovePlan,
): WorkspaceSectionMoveApplication<TSectionData> {
  const directRejection = directMoveRejection(document, plan);
  if (directRejection) {
    return { reason: directRejection, status: "rejected" };
  }

  const hierarchy = workspaceSectionHierarchySnapshot(document);
  const decision = planSectionMove({
    destination: plan.destination,
    hierarchy,
    mode: plan.mode,
    selectedIds: plan.sectionIds,
  });
  if (decision.status === "unchanged") {
    return sectionMovePlansEqual(decision.plan, plan)
      ? { status: "unchanged" }
      : { reason: "section-move-invalid", status: "rejected" };
  }
  if (decision.status !== "planned") {
    return { reason: "section-move-invalid", status: "rejected" };
  }
  if (!sectionMovePlansEqual(decision.plan, plan)) {
    return { reason: "section-move-invalid", status: "rejected" };
  }

  const nextHierarchy = applySectionMovePlan(hierarchy, decision.plan);
  const nextRootSections = movedRootSections(document, nextHierarchy);
  const nextSections = movedSections(document, nextHierarchy, decision.plan);
  if (nextRootSections === document.rootSections && nextSections === document.sections) {
    return { status: "unchanged" };
  }
  return {
    document: {
      ...document,
      rootSections: nextRootSections,
      sections: nextSections,
    },
    status: "applied",
  };
}
