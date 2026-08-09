import {
  deriveWorkspaceParentLookup,
  getWorkspaceSectionOrder,
  WorkspaceDocumentValidationError,
  type WorkspaceDocument,
  type WorkspacePoint,
} from "../core.js";
import {
  resolveSelectionBlock,
  type SectionHierarchySnapshot,
  type SelectionBlock,
} from "./selection-planning.js";

export type WorkspaceSectionSelectionRequest = Readonly<{
  additive: boolean;
  preserveSelected: boolean;
}>;

export type WorkspaceRootSelectionResult =
  Readonly<{ allowed: true; block: SelectionBlock }> | Readonly<{ allowed: false; reason: string }>;

export type WorkspaceStructuralSelectionResult = WorkspaceRootSelectionResult;

function sameSelection(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((sectionId, index) => sectionId === right[index])
  );
}

function unknownSection(sectionId: string): WorkspaceDocumentValidationError {
  return new WorkspaceDocumentValidationError(
    "unknown-section",
    `$.sections[${JSON.stringify(sectionId)}]`,
    `unknown section ${JSON.stringify(sectionId)}`,
  );
}

export function reconcileWorkspaceSelection(
  document: WorkspaceDocument<unknown>,
  sectionIds: readonly string[],
): readonly string[] {
  const selected = new Set(sectionIds);
  return getWorkspaceSectionOrder(document).filter((sectionId) => selected.has(sectionId));
}

export function resolveWorkspaceSelection(
  document: WorkspaceDocument<unknown>,
  sectionIds: readonly string[],
): readonly string[] {
  const knownIds = new Set(getWorkspaceSectionOrder(document));
  const unknownId = sectionIds.find((sectionId) => !knownIds.has(sectionId));
  if (unknownId) {
    throw unknownSection(unknownId);
  }
  const selected = new Set(sectionIds);
  return [...knownIds].filter((sectionId) => selected.has(sectionId));
}

export function normalizeWorkspaceSelectionRoots(
  document: WorkspaceDocument<unknown>,
  sectionIds: readonly string[],
): readonly string[] {
  const selectedSectionIds = resolveWorkspaceSelection(document, sectionIds);
  const selected = new Set(selectedSectionIds);
  const parentLookup = deriveWorkspaceParentLookup(document);
  return selectedSectionIds.filter((sectionId) => {
    let parentId = parentLookup.get(sectionId) ?? null;
    while (parentId !== null) {
      if (selected.has(parentId)) {
        return false;
      }
      parentId = parentLookup.get(parentId) ?? null;
    }
    return true;
  });
}

export function applyWorkspaceSectionSelectionRequest(
  document: WorkspaceDocument<unknown>,
  currentSectionIds: readonly string[],
  sectionId: string,
  request: WorkspaceSectionSelectionRequest,
): readonly string[] {
  if (!Object.hasOwn(document.sections, sectionId)) {
    throw unknownSection(sectionId);
  }
  const current = resolveWorkspaceSelection(document, currentSectionIds);
  const selected = new Set(current);
  if (request.additive) {
    if (selected.has(sectionId)) {
      selected.delete(sectionId);
    } else {
      selected.add(sectionId);
    }
    return resolveWorkspaceSelection(document, [...selected]);
  }
  if (request.preserveSelected && selected.has(sectionId)) {
    return current;
  }
  return [sectionId];
}

function nullRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function selectionHierarchy(document: WorkspaceDocument<unknown>): SectionHierarchySnapshot {
  const parentLookup = deriveWorkspaceParentLookup(document);
  const childrenByParent = nullRecord<readonly string[]>();
  const parentByChild = nullRecord<string | null>();
  const rootPositions = nullRecord<WorkspacePoint>();
  for (const [sectionId, section] of Object.entries(document.sections)) {
    parentByChild[sectionId] = parentLookup.get(sectionId) ?? null;
    if (section.childLayout) {
      childrenByParent[sectionId] = section.childLayout.sectionIds;
    }
  }
  for (const root of document.rootSections) {
    rootPositions[root.sectionId] = root.position;
  }
  return {
    childrenByParent,
    parentByChild,
    rootPositions,
    rootSectionIds: document.rootSections.map(({ sectionId }) => sectionId),
  };
}

export function resolveWorkspaceStructuralSelection(
  document: WorkspaceDocument<unknown>,
  selectedSectionIds: readonly string[],
): WorkspaceStructuralSelectionResult {
  const selected = resolveWorkspaceSelection(document, selectedSectionIds);
  const result = resolveSelectionBlock(selected, selectionHierarchy(document));
  if (!result.allowed) {
    return result;
  }
  const lockedSectionId = result.block.sectionIds.find(
    (sectionId) => document.sections[sectionId]?.positionAndSizeLocked,
  );
  return lockedSectionId
    ? {
        allowed: false,
        reason: "The selection contains a locked section and cannot move.",
      }
    : result;
}

export function resolveWorkspaceRootSelection(
  document: WorkspaceDocument<unknown>,
  selectedSectionIds: readonly string[],
  activeSectionId: string,
): WorkspaceRootSelectionResult {
  const selected = resolveWorkspaceSelection(document, selectedSectionIds);
  const effectiveSelection = selected.includes(activeSectionId) ? selected : [activeSectionId];
  const result = resolveWorkspaceStructuralSelection(document, effectiveSelection);
  if (!result.allowed) {
    return result;
  }
  if (result.block.sourceParentId !== null) {
    return {
      allowed: false,
      reason: "Selected sections must all be top-level for spatial movement.",
    };
  }
  return result;
}

export function translateWorkspaceRootSelection(
  document: WorkspaceDocument<unknown>,
  block: SelectionBlock,
  activeSectionId: string,
  activePosition: WorkspacePoint,
): Readonly<Record<string, WorkspacePoint>> {
  if (block.sourceParentId !== null) {
    throw new Error("Only a top-level selection can be translated spatially.");
  }
  const rootsById = new Map(document.rootSections.map((root) => [root.sectionId, root]));
  const activeRoot = rootsById.get(activeSectionId);
  if (!activeRoot || !block.sectionIds.includes(activeSectionId)) {
    throw new Error(`Active root section ${activeSectionId} is missing from the selection block.`);
  }
  const delta = {
    x: activePosition.x - activeRoot.position.x,
    y: activePosition.y - activeRoot.position.y,
  };
  return Object.fromEntries(
    block.sectionIds.map((sectionId) => {
      const root = rootsById.get(sectionId);
      if (!root) {
        throw new Error(`Selection block section ${sectionId} is not a top-level section.`);
      }
      return [sectionId, { x: root.position.x + delta.x, y: root.position.y + delta.y }] as const;
    }),
  );
}

export function workspaceSelectionsMatch(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return sameSelection(left, right);
}
