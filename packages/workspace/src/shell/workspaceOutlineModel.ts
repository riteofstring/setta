import { matchSorter } from "match-sorter";
import {
  getSectionOrThrow,
  isGroupSection,
} from "../document/documentSelectors.js";
import {
  getVisibleSectionChildrenForDisplay,
  getVisibleTopLevelSectionIdsForDisplay,
} from "../document/savedViewDisplay.js";
import type { WorkspaceDocumentState } from "../document/stores.js";
import type { WorkspaceSection } from "../document/types.js";

export type WorkspaceOutlineNode = {
  section: WorkspaceSection;
  parentSectionId: string | null;
  depth: number;
  positionInSet: number;
  setSize: number;
  children: Array<WorkspaceOutlineNode>;
};

export type WorkspaceOutlineEntry = Omit<WorkspaceOutlineNode, "children">;

function createNodes(
  state: WorkspaceDocumentState,
  sectionIds: Array<string>,
  parentSectionId: string | null,
  depth: number,
): Array<WorkspaceOutlineNode> {
  return sectionIds.map((sectionId, index) => {
    const section = getSectionOrThrow(state, sectionId);
    return {
      section,
      parentSectionId,
      depth,
      positionInSet: index + 1,
      setSize: sectionIds.length,
      children: createNodes(
        state,
        getVisibleSectionChildrenForDisplay(state, sectionId),
        sectionId,
        depth + 1,
      ),
    };
  });
}

export function createWorkspaceOutlineTree(
  state: WorkspaceDocumentState,
): Array<WorkspaceOutlineNode> {
  return createNodes(
    state,
    getVisibleTopLevelSectionIdsForDisplay(state),
    null,
    0,
  );
}

export function filterWorkspaceOutlineTree(
  tree: ReadonlyArray<WorkspaceOutlineNode>,
  query: string,
): Array<WorkspaceOutlineNode> {
  const normalizedQuery = query.trim();
  if (normalizedQuery === "") {
    return [...tree];
  }

  const candidates: Array<WorkspaceOutlineNode> = [];
  function collect(nodes: ReadonlyArray<WorkspaceOutlineNode>): void {
    for (const node of nodes) {
      candidates.push(node);
      collect(node.children);
    }
  }
  collect(tree);

  const matchingIds = new Set(
    matchSorter(candidates, normalizedQuery, {
      keys: [(node) => node.section.name],
    }).map((node) => node.section.id),
  );

  function retainMatchingPaths(
    nodes: ReadonlyArray<WorkspaceOutlineNode>,
  ): Array<WorkspaceOutlineNode> {
    const retained: Array<WorkspaceOutlineNode> = [];
    for (const node of nodes) {
      const children = retainMatchingPaths(node.children);
      if (matchingIds.has(node.section.id) || children.length > 0) {
        retained.push({ ...node, children });
      }
    }
    return retained;
  }

  return retainMatchingPaths(tree);
}

export function getWorkspaceOutlineVisibleEntries(
  tree: ReadonlyArray<WorkspaceOutlineNode>,
  collapsedGroupIds: ReadonlyArray<string>,
): Array<WorkspaceOutlineEntry> {
  const collapsed = new Set(collapsedGroupIds);
  const entries: Array<WorkspaceOutlineEntry> = [];

  function visit(nodes: ReadonlyArray<WorkspaceOutlineNode>): void {
    for (const { children, ...entry } of nodes) {
      entries.push(entry);
      if (!collapsed.has(entry.section.id)) {
        visit(children);
      }
    }
  }

  visit(tree);
  return entries;
}

export function getValidWorkspaceOutlineCollapsedGroupIds(
  state: WorkspaceDocumentState,
  collapsedGroupIds: ReadonlyArray<string>,
): Array<string> {
  return collapsedGroupIds.filter((sectionId) => {
    const section = state.sections[sectionId];
    return section !== undefined && isGroupSection(section);
  });
}

function getVisibleAncestorId(
  state: WorkspaceDocumentState,
  sectionId: string,
  visibleIds: Set<string>,
): string | null {
  let parentId = state.parentSectionMap[sectionId] ?? null;
  while (parentId !== null) {
    if (visibleIds.has(parentId)) {
      return parentId;
    }
    parentId = state.parentSectionMap[parentId] ?? null;
  }
  return null;
}

function getFirstVisibleSectionId(
  entries: ReadonlyArray<WorkspaceOutlineEntry>,
): string | null {
  const firstEntry = entries[0];
  return firstEntry ? firstEntry.section.id : null;
}

function getReplacementSectionId(
  previousEntries: ReadonlyArray<WorkspaceOutlineEntry>,
  nextEntries: ReadonlyArray<WorkspaceOutlineEntry>,
  focusedSectionId: string,
): string | null {
  const previousIndex = previousEntries.findIndex(
    (entry) => entry.section.id === focusedSectionId,
  );
  if (previousIndex < 0) {
    return getFirstVisibleSectionId(nextEntries);
  }
  const replacement =
    nextEntries[Math.min(previousIndex, nextEntries.length - 1)];
  return replacement ? replacement.section.id : null;
}

export function resolveWorkspaceOutlineFocus(
  state: WorkspaceDocumentState,
  previousEntries: ReadonlyArray<WorkspaceOutlineEntry>,
  nextEntries: ReadonlyArray<WorkspaceOutlineEntry>,
  focusedSectionId: string | null,
): string | null {
  if (nextEntries.length === 0) {
    return null;
  }
  if (focusedSectionId === null) {
    return getFirstVisibleSectionId(nextEntries);
  }

  const visibleIds = new Set(nextEntries.map((entry) => entry.section.id));
  if (visibleIds.has(focusedSectionId)) {
    return focusedSectionId;
  }
  if (state.sections[focusedSectionId]) {
    const visibleAncestorId = getVisibleAncestorId(
      state,
      focusedSectionId,
      visibleIds,
    );
    if (visibleAncestorId !== null) {
      return visibleAncestorId;
    }
  }
  return getReplacementSectionId(
    previousEntries,
    nextEntries,
    focusedSectionId,
  );
}

export function findWorkspaceOutlineTypeaheadMatch(
  entries: ReadonlyArray<WorkspaceOutlineEntry>,
  currentSectionId: string,
  query: string,
): string | null {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (entries.length === 0 || normalizedQuery === "") {
    return null;
  }
  const currentIndex = entries.findIndex(
    (entry) => entry.section.id === currentSectionId,
  );
  for (let offset = 1; offset <= entries.length; offset += 1) {
    const index = (Math.max(currentIndex, 0) + offset) % entries.length;
    const entry = entries[index];
    if (
      entry?.section.name.trim().toLocaleLowerCase().startsWith(normalizedQuery)
    ) {
      return entry.section.id;
    }
  }
  return null;
}
