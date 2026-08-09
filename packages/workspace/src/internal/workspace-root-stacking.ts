import {
  deriveWorkspaceParentLookup,
  type WorkspaceDocument,
  type WorkspaceRootSection,
} from "../core.js";

export type WorkspaceRootStackingAction =
  "bring-forward" | "bring-to-front" | "send-backward" | "send-to-back";

export function resolveWorkspaceTopLevelAncestors(
  document: WorkspaceDocument<unknown>,
  sectionIds: readonly string[],
): readonly string[] {
  const parentLookup = deriveWorkspaceParentLookup(document);
  const rootIds = new Set(document.rootSections.map(({ sectionId }) => sectionId));
  const selectedRootIds = new Set<string>();

  for (const sectionId of sectionIds) {
    let rootId = sectionId;
    let parentId = parentLookup.get(rootId) ?? null;
    while (parentId !== null) {
      rootId = parentId;
      parentId = parentLookup.get(rootId) ?? null;
    }
    if (!rootIds.has(rootId)) {
      throw new Error(`Workspace section ${JSON.stringify(sectionId)} has no top-level ancestor.`);
    }
    selectedRootIds.add(rootId);
  }

  return document.rootSections
    .map(({ sectionId }) => sectionId)
    .filter((sectionId) => selectedRootIds.has(sectionId));
}

function moveSelectedToEdge(
  roots: readonly WorkspaceRootSection[],
  selectedIds: ReadonlySet<string>,
  edge: "back" | "front",
): readonly WorkspaceRootSection[] {
  const selected = roots.filter(({ sectionId }) => selectedIds.has(sectionId));
  const unselected = roots.filter(({ sectionId }) => !selectedIds.has(sectionId));
  return edge === "front" ? [...unselected, ...selected] : [...selected, ...unselected];
}

function selectedCanSwap(
  current: WorkspaceRootSection | undefined,
  neighbor: WorkspaceRootSection | undefined,
  selectedIds: ReadonlySet<string>,
): current is WorkspaceRootSection {
  return Boolean(
    current &&
    neighbor &&
    selectedIds.has(current.sectionId) &&
    !selectedIds.has(neighbor.sectionId),
  );
}

function moveSelectedForward(
  roots: readonly WorkspaceRootSection[],
  selectedIds: ReadonlySet<string>,
): readonly WorkspaceRootSection[] {
  const next = [...roots];
  for (let index = next.length - 2; index >= 0; index -= 1) {
    const current = next[index];
    const neighbor = next[index + 1];
    if (selectedCanSwap(current, neighbor, selectedIds) && neighbor) {
      next[index] = neighbor;
      next[index + 1] = current;
    }
  }
  return next;
}

function moveSelectedBackward(
  roots: readonly WorkspaceRootSection[],
  selectedIds: ReadonlySet<string>,
): readonly WorkspaceRootSection[] {
  const next = [...roots];
  for (let index = 1; index < next.length; index += 1) {
    const current = next[index];
    const neighbor = next[index - 1];
    if (selectedCanSwap(current, neighbor, selectedIds) && neighbor) {
      next[index] = neighbor;
      next[index - 1] = current;
    }
  }
  return next;
}

export function planWorkspaceRootStacking(
  document: WorkspaceDocument<unknown>,
  sectionIds: readonly string[],
  action: WorkspaceRootStackingAction,
): readonly WorkspaceRootSection[] {
  const selectedIds = new Set(resolveWorkspaceTopLevelAncestors(document, sectionIds));
  if (selectedIds.size === 0) {
    return document.rootSections;
  }
  if (action === "bring-to-front") {
    return moveSelectedToEdge(document.rootSections, selectedIds, "front");
  }
  if (action === "send-to-back") {
    return moveSelectedToEdge(document.rootSections, selectedIds, "back");
  }
  return action === "bring-forward"
    ? moveSelectedForward(document.rootSections, selectedIds)
    : moveSelectedBackward(document.rootSections, selectedIds);
}

export function workspaceRootStackingMatches(
  left: readonly WorkspaceRootSection[],
  right: readonly WorkspaceRootSection[],
): boolean {
  return (
    left.length === right.length &&
    left.every(({ sectionId }, index) => sectionId === right[index]?.sectionId)
  );
}
