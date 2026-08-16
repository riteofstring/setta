import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import {
  getSectionOrThrow,
  GROUP_SECTION_KIND,
  isGroupSection,
} from "./documentSelectors";
import {
  createNodesMapFromDocumentChildren,
  reprojectNodeStylesForAppearance,
} from "./nodeProjection";
import {
  runWithAtomicallyPublishedWorkspaceStores,
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
  type WorkspaceDocumentState,
} from "./stores";
import type { WorkspaceSection } from "./types";

// The reference's per-flag commit funnels (optimistic impl write + one backend route each:
// `setSectionName`, `togglePositionLocks`, `toggleMinimized`, `toggleGroupOrientation`,
// `deleteSections`). The package applies the same canonical writes directly and notifies the
// host once per funnel through the document-change callback.

function setSectionValues(
  sectionId: string,
  values: Partial<WorkspaceSection>,
) {
  useWorkspaceDocument.setState((state) => {
    const section = getSectionOrThrow(state, sectionId);
    return {
      sections: { ...state.sections, [sectionId]: { ...section, ...values } },
    };
  });
  notifyWorkspaceDocumentChange();
}

function getUniqueSectionIds(sectionIds: ReadonlyArray<string>): Array<string> {
  const uniqueIds = [...new Set(sectionIds)];
  if (uniqueIds.length === 0) {
    throw new Error("A section mutation requires at least one section id.");
  }
  const state = useWorkspaceDocument.getState();
  for (const sectionId of uniqueIds) {
    getSectionOrThrow(state, sectionId);
  }
  return uniqueIds;
}

export function setSectionName(sectionId: string, name: string) {
  setSectionValues(sectionId, { name });
}

export function setSectionStyleColor(
  sectionId: string,
  styleColor: string | null,
): void {
  const normalized =
    styleColor === null || styleColor.trim() === "" ? null : styleColor.trim();
  if (normalized !== null && !/^#?[0-9a-f]{6}$/iu.test(normalized)) {
    throw new Error(
      `Section ${sectionId} style color must be a six-digit hex color.`,
    );
  }
  const canonical =
    normalized === null
      ? null
      : `#${normalized.replace(/^#/u, "").toLowerCase()}`;
  const documentState = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  const nextDocumentState = {
    ...documentState,
    sections: {
      ...documentState.sections,
      [sectionId]: { ...section, styleColor: canonical },
    },
  };
  const nextNodes = reprojectNodeStylesForAppearance(
    nextDocumentState,
    useNodeInternals.getState().x,
  );
  const activeSections = useActiveSections.getState();
  runWithAtomicallyPublishedWorkspaceStores(
    {
      document: nextDocumentState,
      nodeInternals: { x: nextNodes },
      activeSections,
    },
    () => {
      useNodeInternals.setState({ x: nextNodes });
      useWorkspaceDocument.setState(nextDocumentState);
    },
  );
  notifyWorkspaceDocumentChange();
}

export function setSectionsPositionLocked(
  sectionIds: ReadonlyArray<string>,
  positionAndSizeLocked: boolean,
): void {
  const uniqueIds = getUniqueSectionIds(sectionIds);
  useWorkspaceDocument.setState((state) => {
    const sections = { ...state.sections };
    for (const sectionId of uniqueIds) {
      const section = getSectionOrThrow(state, sectionId);
      sections[sectionId] = { ...section, positionAndSizeLocked };
    }
    return { sections };
  });
  notifyWorkspaceDocumentChange();
}

export function togglePositionLock(sectionId: string) {
  const section = getSectionOrThrow(useWorkspaceDocument.getState(), sectionId);
  setSectionsPositionLocked([sectionId], !section.positionAndSizeLocked);
}

export function toggleMinimized(sectionId: string) {
  const section = getSectionOrThrow(useWorkspaceDocument.getState(), sectionId);
  setSectionValues(sectionId, { isMinimized: !section.isMinimized });
}

export function toggleGroupOrientation(sectionId: string) {
  const section = getSectionOrThrow(useWorkspaceDocument.getState(), sectionId);
  // The reference funnel refuses to write orientation onto anything but a group.
  if (!isGroupSection(section)) {
    return;
  }
  setSectionValues(sectionId, {
    isHorizontalOrientation: !section.isHorizontalOrientation,
  });
}

function collectSectionSubtreeIds(
  state: WorkspaceDocumentState,
  sectionId: string,
): Array<string> {
  const ids = [sectionId];
  let idx = 0;
  while (idx < ids.length) {
    const currId = ids[idx];
    if (currId !== undefined) {
      ids.push(...getSectionOrThrow(state, currId).children);
    }
    idx += 1;
  }
  return ids;
}

// Deletes a section and its descendants, mirroring the reference's `deleteSections` result:
// the subtree leaves the section records, top-level layouts, parent map, and selection, and the
// deleted section leaves its parent's children. The document, derived node geometry, and
// selection publish atomically, like every other canonical replacement.
export function deleteSection(sectionId: string) {
  deleteSections([sectionId]);
}

export function deleteSections(sectionIds: ReadonlyArray<string>): void {
  const documentState = useWorkspaceDocument.getState();
  const deletedIds = new Set<string>();
  for (const sectionId of getUniqueSectionIds(sectionIds)) {
    for (const deletedId of collectSectionSubtreeIds(
      documentState,
      sectionId,
    )) {
      deletedIds.add(deletedId);
    }
  }

  const sections: Record<string, WorkspaceSection> = {};
  for (const [id, section] of Object.entries(documentState.sections)) {
    if (deletedIds.has(id)) {
      continue;
    }
    sections[id] = section.children.some((childId) => deletedIds.has(childId))
      ? {
          ...section,
          children: section.children.filter(
            (childId) => !deletedIds.has(childId),
          ),
        }
      : section;
  }

  const topLevelSections = Object.fromEntries(
    Object.entries(documentState.topLevelSections).filter(
      ([id]) => !deletedIds.has(id),
    ),
  );
  const parentSectionMap = Object.fromEntries(
    Object.entries(documentState.parentSectionMap).filter(
      ([id]) => !deletedIds.has(id),
    ),
  );

  const nextDocumentState: WorkspaceDocumentState = {
    sections,
    topLevelSections,
    viewport: documentState.viewport,
    parentSectionMap,
  };
  const nextNodesMap = createNodesMapFromDocumentChildren(
    nextDocumentState,
    useNodeInternals.getState().x,
  );
  const nextActiveSections = {
    activeIds: useActiveSections
      .getState()
      .activeIds.filter((id) => !deletedIds.has(id)),
  };
  runWithAtomicallyPublishedWorkspaceStores(
    {
      document: nextDocumentState,
      nodeInternals: { x: nextNodesMap },
      activeSections: nextActiveSections,
    },
    () => {
      useNodeInternals.setState({ x: nextNodesMap });
      useWorkspaceDocument.setState(nextDocumentState);
      useActiveSections.setState(nextActiveSections);
    },
  );
  notifyWorkspaceDocumentChange();
}

function getGroupingParentId(
  state: WorkspaceDocumentState,
  sectionIds: ReadonlyArray<string>,
): string | null {
  const firstId = sectionIds[0];
  if (!firstId) {
    throw new Error("Grouping requires at least one section id.");
  }
  const parentId = state.parentSectionMap[firstId] ?? null;
  for (const sectionId of sectionIds.slice(1)) {
    if ((state.parentSectionMap[sectionId] ?? null) !== parentId) {
      throw new Error(
        "Grouping requires selected sections to share the same parent.",
      );
    }
  }
  return parentId;
}

function getOrderedGroupingIds(
  state: WorkspaceDocumentState,
  sectionIds: ReadonlyArray<string>,
  parentId: string | null,
): Array<string> {
  const selected = new Set(sectionIds);
  const siblingIds =
    parentId === null
      ? Object.keys(state.topLevelSections).filter(
          (sectionId) => (state.parentSectionMap[sectionId] ?? null) === null,
        )
      : getSectionOrThrow(state, parentId).children;
  const ordered = siblingIds.filter((sectionId) => selected.has(sectionId));
  if (ordered.length !== selected.size) {
    throw new Error("Grouping selection is not complete in its shared parent.");
  }
  return ordered;
}

function createGroupSection(
  groupId: string,
  children: Array<string>,
): WorkspaceSection {
  return {
    id: groupId,
    kind: GROUP_SECTION_KIND,
    name: "Group",
    size: { width: "auto", height: "auto" },
    overflowMode: false,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children,
  };
}

function createGroupedDocumentState(
  state: WorkspaceDocumentState,
  sectionIds: ReadonlyArray<string>,
  groupId: string,
): WorkspaceDocumentState {
  if (state.sections[groupId]) {
    throw new Error(`Cannot create group with existing section id ${groupId}.`);
  }
  const parentId = getGroupingParentId(state, sectionIds);
  const orderedIds = getOrderedGroupingIds(state, sectionIds, parentId);
  const selected = new Set(orderedIds);
  const sections = {
    ...state.sections,
    [groupId]: createGroupSection(groupId, orderedIds),
  };
  const parentSectionMap = { ...state.parentSectionMap };
  for (const sectionId of orderedIds) {
    parentSectionMap[sectionId] = groupId;
  }

  if (parentId !== null) {
    const parent = getSectionOrThrow(state, parentId);
    const insertionIndex = parent.children.findIndex((sectionId) =>
      selected.has(sectionId),
    );
    if (insertionIndex < 0) {
      throw new Error(`Grouping selection is missing from parent ${parentId}.`);
    }
    sections[parentId] = {
      ...parent,
      children: [
        ...parent.children
          .slice(0, insertionIndex)
          .filter((id) => !selected.has(id)),
        groupId,
        ...parent.children
          .slice(insertionIndex)
          .filter((id) => !selected.has(id)),
      ],
    };
    parentSectionMap[groupId] = parentId;
    return { ...state, sections, parentSectionMap };
  }

  const layouts = orderedIds.map((sectionId) => {
    const layout = state.topLevelSections[sectionId];
    if (!layout) {
      throw new Error(
        `Top-level grouping requires a layout for section ${sectionId}.`,
      );
    }
    return layout;
  });
  const maxZIndex = Object.values(state.topLevelSections).reduce(
    (maximum, layout) => Math.max(maximum, layout.zIndex),
    -1,
  );
  const groupLayout = {
    x: Math.min(...layouts.map((layout) => layout.x)),
    y: Math.min(...layouts.map((layout) => layout.y)),
    w: null,
    h: null,
    zIndex: maxZIndex + 1,
  };
  const topLevelSections: WorkspaceDocumentState["topLevelSections"] = {};
  let insertedGroup = false;
  for (const [sectionId, layout] of Object.entries(state.topLevelSections)) {
    if (selected.has(sectionId)) {
      if (!insertedGroup) {
        topLevelSections[groupId] = groupLayout;
        insertedGroup = true;
      }
      continue;
    }
    topLevelSections[sectionId] = layout;
  }
  if (!insertedGroup) {
    throw new Error(
      "Top-level grouping selection is missing from the document order.",
    );
  }
  delete parentSectionMap[groupId];
  return { ...state, sections, topLevelSections, parentSectionMap };
}

export function groupSections(
  sectionIds: ReadonlyArray<string>,
  groupId: string,
): void {
  const uniqueIds = getUniqueSectionIds(sectionIds);
  if (uniqueIds.length < 2) {
    throw new Error("Grouping requires at least two distinct sections.");
  }
  if (typeof groupId !== "string" || groupId.trim() === "") {
    throw new Error("A new group requires a nonblank section id.");
  }
  const documentState = useWorkspaceDocument.getState();
  const nextDocumentState = createGroupedDocumentState(
    documentState,
    uniqueIds,
    groupId.trim(),
  );
  const nextNodesMap = createNodesMapFromDocumentChildren(
    nextDocumentState,
    useNodeInternals.getState().x,
  );
  const nextActiveSections = { activeIds: [groupId.trim()] };
  runWithAtomicallyPublishedWorkspaceStores(
    {
      document: nextDocumentState,
      nodeInternals: { x: nextNodesMap },
      activeSections: nextActiveSections,
    },
    () => {
      useNodeInternals.setState({ x: nextNodesMap });
      useWorkspaceDocument.setState(nextDocumentState);
      useActiveSections.setState(nextActiveSections);
    },
  );
  notifyWorkspaceDocumentChange();
}
