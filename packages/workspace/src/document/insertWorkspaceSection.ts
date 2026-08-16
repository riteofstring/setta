import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { resolveAndValidateWorkspaceSections } from "./loadWorkspaceDocument";
import { createNodesMapFromDocumentChildren } from "./nodeProjection";
import {
  getActiveSectionsStore,
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
  runWithAtomicallyPublishedWorkspaceStores,
} from "./stores";
import type { Position, WorkspaceSectionInput } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

function assertFinitePosition(position: Position): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error("A created workspace section requires a finite position.");
  }
}

export function insertWorkspaceSection(
  host: WorkspaceHost,
  sectionInput: WorkspaceSectionInput,
  position: Position,
): void {
  assertFinitePosition(position);
  if (typeof sectionInput.id !== "string" || sectionInput.id.trim() === "") {
    throw new Error("A created workspace section requires a non-empty id.");
  }
  const sectionId = sectionInput.id.trim();
  if (sectionId !== sectionInput.id) {
    throw new Error(
      "A created workspace section id cannot have leading or trailing whitespace.",
    );
  }
  if (sectionInput.children.length !== 0) {
    throw new Error(
      "A creation command must return one section without existing child claims.",
    );
  }

  const current = getWorkspaceDocumentStore(host).getState();
  if (current.sections[sectionId]) {
    throw new Error(`Cannot create duplicate workspace section ${sectionId}.`);
  }
  const validated = resolveAndValidateWorkspaceSections(host, {
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
  const nextNodes = createNodesMapFromDocumentChildren(
    host,
    nextDocument,
    getNodeInternalsStore(host).getState().x,
  );
  const nextActiveSections = { activeIds: [sectionId] };
  runWithAtomicallyPublishedWorkspaceStores(
    host,
    {
      document: nextDocument,
      nodeInternals: { x: nextNodes },
      activeSections: nextActiveSections,
    },
    () => {
      getNodeInternalsStore(host).setState({ x: nextNodes });
      getWorkspaceDocumentStore(host).setState(nextDocument);
      getActiveSectionsStore(host).setState(nextActiveSections);
    },
  );
  notifyWorkspaceDocumentChange(host);
}
