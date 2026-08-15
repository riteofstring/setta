import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { resolveAndValidateWorkspaceSections } from "./loadWorkspaceDocument";
import { createNodesMapFromDocumentChildren } from "./nodeProjection";
import {
  runWithAtomicallyPublishedWorkspaceStores,
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "./stores";
import type { Position, WorkspaceSectionInput } from "./types";

function assertFinitePosition(position: Position): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error("A created workspace section requires a finite position.");
  }
}

export function insertWorkspaceSection(
  sectionInput: WorkspaceSectionInput,
  position: Position,
): void {
  assertFinitePosition(position);
  if (typeof sectionInput.id !== "string" || sectionInput.id.trim() === "") {
    throw new Error("A created workspace section requires a non-empty id.");
  }
  const sectionId = sectionInput.id.trim();
  if (sectionId !== sectionInput.id) {
    throw new Error("A created workspace section id cannot have leading or trailing whitespace.");
  }
  if (sectionInput.children.length !== 0) {
    throw new Error("A creation command must return one section without existing child claims.");
  }

  const current = useWorkspaceDocument.getState();
  if (current.sections[sectionId]) {
    throw new Error(`Cannot create duplicate workspace section ${sectionId}.`);
  }
  const validated = resolveAndValidateWorkspaceSections({
    ...current.sections,
    [sectionId]: sectionInput,
  });
  const section = validated.sections[sectionId];
  if (!section) {
    throw new Error(`Created workspace section ${sectionId} did not resolve.`);
  }
  const maximumZIndex = Object.values(current.topLevelSections).reduce(
    (maximum, layout) => Math.max(maximum, layout.zIndex),
    -1,
  );
  const nextDocument = {
    ...current,
    sections: { ...current.sections, [sectionId]: section },
    topLevelSections: {
      ...current.topLevelSections,
      [sectionId]: {
        x: position.x,
        y: position.y,
        w: section.size.width === "auto" ? null : section.size.width,
        h: section.size.height === "auto" ? null : section.size.height,
        zIndex: maximumZIndex + 1,
      },
    },
    parentSectionMap: validated.parentSectionMap,
  };
  const nextNodes = createNodesMapFromDocumentChildren(nextDocument, useNodeInternals.getState().x);
  const nextActiveSections = { activeIds: [sectionId] };
  runWithAtomicallyPublishedWorkspaceStores(
    {
      document: nextDocument,
      nodeInternals: { x: nextNodes },
      activeSections: nextActiveSections,
    },
    () => {
      useNodeInternals.setState({ x: nextNodes });
      useWorkspaceDocument.setState(nextDocument);
      useActiveSections.setState(nextActiveSections);
    },
  );
  notifyWorkspaceDocumentChange();
}
