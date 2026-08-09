import {
  WORKSPACE_DOCUMENT_SCHEMA_VERSION,
  type WorkspaceDocument,
  type WorkspaceJsonValue,
  type WorkspaceParentLookup,
} from "./workspace-document-contract.js";
import {
  buildWorkspaceParentLookup,
  validateWorkspaceDocument,
  WorkspaceDocumentValidationError,
} from "./workspace-document-validation.js";
import { WORKSPACE_DEFAULT_ZOOM } from "./workspace-policy.js";

export function createEmptyWorkspaceDocument<
  TSectionData = WorkspaceJsonValue,
>(): WorkspaceDocument<TSectionData> {
  return {
    rootSections: [],
    schemaVersion: WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections: {},
    viewport: { x: 0, y: 0, zoom: WORKSPACE_DEFAULT_ZOOM },
  };
}

export function deriveWorkspaceParentLookup(
  document: WorkspaceDocument<unknown>,
): WorkspaceParentLookup {
  validateWorkspaceDocument(document);
  return buildWorkspaceParentLookup(document.rootSections, document.sections);
}

function traverseWorkspaceSections(
  document: WorkspaceDocument<unknown>,
  rootSectionIds: readonly string[],
): readonly string[] {
  const ordered: string[] = [];
  const pending = [...rootSectionIds].reverse();
  while (pending.length > 0) {
    const sectionId = pending.pop();
    if (!sectionId) {
      continue;
    }
    ordered.push(sectionId);
    const children = document.sections[sectionId]?.childLayout?.sectionIds ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index];
      if (childId) {
        pending.push(childId);
      }
    }
  }
  return ordered;
}

export function getWorkspaceSectionOrder(document: WorkspaceDocument<unknown>): readonly string[] {
  validateWorkspaceDocument(document);
  return traverseWorkspaceSections(
    document,
    document.rootSections.map(({ sectionId }) => sectionId),
  );
}

export function getWorkspaceNavigationOrder(
  document: WorkspaceDocument<unknown>,
): readonly string[] {
  validateWorkspaceDocument(document);
  const persistentOrder = new Map(
    document.rootSections.map(({ sectionId }, index) => [sectionId, index]),
  );
  const rootSectionIds = [...document.rootSections]
    .sort(
      (left, right) =>
        left.position.y - right.position.y ||
        left.position.x - right.position.x ||
        (persistentOrder.get(left.sectionId) ?? 0) - (persistentOrder.get(right.sectionId) ?? 0) ||
        left.sectionId.localeCompare(right.sectionId),
    )
    .map((root) => root.sectionId);
  return traverseWorkspaceSections(document, rootSectionIds);
}

export function getAdjacentWorkspaceSectionId(
  document: WorkspaceDocument<unknown>,
  sectionId: string,
  direction: "next" | "previous",
): string | null {
  if (direction !== "next" && direction !== "previous")
    throw new TypeError("Workspace navigation direction must be next or previous.");
  const ordered = getWorkspaceNavigationOrder(document);
  const currentIndex = ordered.indexOf(sectionId);
  if (currentIndex < 0) {
    throw new WorkspaceDocumentValidationError(
      "unknown-section",
      `$.sections[${JSON.stringify(sectionId)}]`,
      `unknown section ${JSON.stringify(sectionId)}`,
    );
  }
  const offset = direction === "next" ? 1 : -1;
  return ordered[currentIndex + offset] ?? null;
}

export function isWorkspaceSectionDescendant(
  parentLookup: WorkspaceParentLookup,
  sectionId: string,
  possibleAncestorId: string,
): boolean {
  let remainingParents = parentLookup.size;
  let parentId = parentLookup.get(sectionId) ?? null;
  while (parentId !== null) {
    if (remainingParents === 0) {
      throw new TypeError("Workspace parent lookup must be acyclic.");
    }
    remainingParents -= 1;
    if (parentId === possibleAncestorId) {
      return true;
    }
    parentId = parentLookup.get(parentId) ?? null;
  }
  return false;
}
