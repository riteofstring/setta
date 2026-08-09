import {
  validateWorkspaceDocument,
  type WorkspaceChildLayout,
  type WorkspaceDocument,
  type WorkspaceFreeformChildLayout,
  type WorkspacePoint,
  type WorkspaceSection,
} from "../core.js";
import type { WorkspaceDocumentCommandResult } from "./workspace-document-command-contract.js";
import type { WorkspaceSiblingSelection } from "./workspace-section-grouping.js";

function appliedGrouping<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
): WorkspaceDocumentCommandResult<TSectionData> {
  validateWorkspaceDocument(document);
  return { document, reason: "section-group", status: "applied" };
}

function replaceSelectedIds(
  siblingIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  replacementId: string,
): readonly string[] {
  const firstSelectedIndex = siblingIds.findIndex((sectionId) => selectedIds.has(sectionId));
  return siblingIds.flatMap((sectionId, index) => {
    if (!selectedIds.has(sectionId)) {
      return [sectionId];
    }
    return index === firstSelectedIndex ? [replacementId] : [];
  });
}

function groupedSections<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  group: WorkspaceSection<TSectionData>,
  childSectionIds: readonly string[],
): Readonly<Record<string, WorkspaceSection<TSectionData>>> {
  if (!group.childLayout) {
    throw new TypeError("Workspace group section must provide a child layout.");
  }
  if (group.childLayout.sectionIds.length > 0) {
    throw new TypeError("Workspace group section child layout must start empty.");
  }
  return {
    ...document.sections,
    [group.id]: {
      ...group,
      childLayout: { ...group.childLayout, sectionIds: childSectionIds },
    },
  };
}

function applyRootGrouping<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  groupId: string,
  position: WorkspacePoint | null,
  selected: ReadonlySet<string>,
  sections: Readonly<Record<string, WorkspaceSection<TSectionData>>>,
): WorkspaceDocumentCommandResult<TSectionData> {
  if (position === null) {
    throw new TypeError("Top-level workspace grouping requires a position.");
  }
  const firstSelectedIndex = document.rootSections.findIndex(({ sectionId }) =>
    selected.has(sectionId),
  );
  const rootSections = document.rootSections.flatMap((root, index) => {
    if (!selected.has(root.sectionId)) {
      return [root];
    }
    return index === firstSelectedIndex ? [{ position, sectionId: groupId }] : [];
  });
  return appliedGrouping({ ...document, rootSections, sections });
}

function applyNestedGrouping<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  groupId: string,
  parentSectionId: string,
  position: WorkspacePoint | null,
  selected: ReadonlySet<string>,
  sections: Readonly<Record<string, WorkspaceSection<TSectionData>>>,
): WorkspaceDocumentCommandResult<TSectionData> {
  const parent = document.sections[parentSectionId] as WorkspaceSection<TSectionData>;
  const childLayout = parent.childLayout;
  if (!childLayout) {
    throw new Error(`Workspace parent section ${parentSectionId} is missing its child layout.`);
  }
  const nextLayout = groupedParentLayout(childLayout, groupId, position, selected);
  return appliedGrouping({
    ...document,
    sections: {
      ...sections,
      [parentSectionId]: {
        ...parent,
        childLayout: nextLayout,
      },
    },
  });
}

function requiredPosition(layout: WorkspaceFreeformChildLayout, sectionId: string): WorkspacePoint {
  const position = layout.positions[sectionId];
  if (!position) {
    throw new Error(`Workspace freeform child ${sectionId} is missing its canonical position.`);
  }
  return position;
}

function groupedParentLayout(
  childLayout: WorkspaceChildLayout,
  groupId: string,
  position: WorkspacePoint | null,
  selected: ReadonlySet<string>,
): WorkspaceChildLayout {
  const sectionIds = replaceSelectedIds(childLayout.sectionIds, selected, groupId);
  if (childLayout.positioning === "ordered") {
    if (position !== null) {
      throw new TypeError("Grouping in an ordered workspace parent must not provide a position.");
    }
    return { ...childLayout, sectionIds };
  }
  if (position === null) {
    throw new TypeError("Grouping in a freeform workspace parent requires a local position.");
  }
  return {
    ...childLayout,
    positions: Object.fromEntries(
      sectionIds.map((sectionId) => [
        sectionId,
        sectionId === groupId ? { ...position } : requiredPosition(childLayout, sectionId),
      ]),
    ),
    sectionIds,
  };
}

export function applyWorkspaceSectionGrouping<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  group: WorkspaceSection<TSectionData>,
  selection: WorkspaceSiblingSelection,
  position: WorkspacePoint | null,
): WorkspaceDocumentCommandResult<TSectionData> {
  if (Object.hasOwn(document.sections, group.id)) {
    return { document, reason: "section-id-exists", status: "rejected" };
  }
  if (group.childLayout?.positioning === "freeform") {
    return { document, reason: "section-layout-unsupported", status: "rejected" };
  }
  const selected = new Set(selection.sectionIds);
  const sections = groupedSections(document, group, selection.sectionIds);
  return selection.parentSectionId === null
    ? applyRootGrouping(document, group.id, position, selected, sections)
    : applyNestedGrouping(
        document,
        group.id,
        selection.parentSectionId,
        position,
        selected,
        sections,
      );
}
