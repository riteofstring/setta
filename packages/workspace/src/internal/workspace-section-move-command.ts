import {
  deriveWorkspaceParentLookup,
  type WorkspaceActionRejectionReason,
  type WorkspaceDocument,
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
  hierarchy: SectionHierarchySnapshot,
  plan: SectionMovePlan,
): boolean {
  return sectionHierarchySnapshotsEqual(
    workspaceSectionHierarchySnapshot(document),
    applySectionMovePlan(hierarchy, plan),
  );
}

function movedSections<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  hierarchy: SectionHierarchySnapshot,
  plan: SectionMovePlan,
): Readonly<Record<string, WorkspaceSection<TSectionData>>> {
  const changedParentIds = new Set(
    [plan.sourceParentId, plan.destinationParentId].filter(
      (sectionId): sectionId is string => sectionId !== null,
    ),
  );
  if (changedParentIds.size === 0) {
    return document.sections;
  }
  return Object.fromEntries(
    Object.entries(document.sections).map(([sectionId, section]) => {
      if (!section.childLayout || !changedParentIds.has(sectionId)) {
        return [sectionId, section];
      }
      return [
        sectionId,
        {
          ...section,
          childLayout: {
            ...section.childLayout,
            sectionIds: hierarchy.childrenByParent[sectionId] ?? [],
          },
        },
      ];
    }),
  );
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
  if (!destinationCanContainSections(document, plan.destinationParentId)) {
    return "section-not-container";
  }
  return plan.sectionIds.some((sectionId) => document.sections[sectionId]?.positionAndSizeLocked)
    ? "section-locked"
    : null;
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
    destination: {
      index: plan.destinationIndex,
      parentId: plan.destinationParentId,
      topLevelPositions: plan.topLevelPositions,
    },
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
    return {
      reason:
        decision.status === "rejected"
          ? decision.code === "mixed-parent-selection"
            ? "mixed-parent-selection"
            : "section-move-invalid"
          : "section-move-invalid",
      status: "rejected",
    };
  }
  if (!sectionMovePlansEqual(decision.plan, plan)) {
    return { reason: "section-move-invalid", status: "rejected" };
  }

  const nextHierarchy = applySectionMovePlan(hierarchy, decision.plan);
  return {
    document: {
      ...document,
      rootSections: movedRootSections(document, nextHierarchy),
      sections: movedSections(document, nextHierarchy, decision.plan),
    },
    status: "applied",
  };
}
