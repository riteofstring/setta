import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import {
  getActiveSectionsStore,
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
  runWithAtomicallyPublishedWorkspaceStores,
  type WorkspaceDocumentState,
} from "./stores";
import type { Node, TopLevelSectionLayout } from "./types";
import type { WorkspaceHost } from "../workspaceHost";

function topLevelLayoutsEqual(
  current: Readonly<Record<string, TopLevelSectionLayout>>,
  next: Readonly<Record<string, TopLevelSectionLayout>>,
): boolean {
  const currentIds = Object.keys(current);
  const nextIds = Object.keys(next);
  if (currentIds.length !== nextIds.length) {
    return false;
  }
  return currentIds.every((sectionId, index) => {
    if (nextIds[index] !== sectionId) {
      return false;
    }
    const currentLayout = current[sectionId];
    const nextLayout = next[sectionId];
    return (
      currentLayout !== undefined &&
      nextLayout !== undefined &&
      currentLayout.x === nextLayout.x &&
      currentLayout.y === nextLayout.y &&
      currentLayout.w === nextLayout.w &&
      currentLayout.h === nextLayout.h &&
      currentLayout.zIndex === nextLayout.zIndex
    );
  });
}

function createTopLevelLayouts(
  documentState: WorkspaceDocumentState,
  nodeInternals: ReadonlyMap<string, Node>,
): Record<string, TopLevelSectionLayout> {
  const isTopLevel = (sectionId: string) =>
    (Object.hasOwn(documentState.parentSectionMap, sectionId)
      ? (documentState.parentSectionMap[sectionId] ?? null)
      : null) === null;

  const nextLayouts = Object.create(null) as Record<
    string,
    TopLevelSectionLayout
  >;
  for (const [sectionId, layout] of Object.entries(
    documentState.topLevelSections,
  )) {
    if (
      Object.hasOwn(documentState.sections, sectionId) &&
      isTopLevel(sectionId)
    ) {
      nextLayouts[sectionId] = { ...layout };
    }
  }
  for (const node of nodeInternals.values()) {
    if (
      !Object.hasOwn(documentState.sections, node.id) ||
      !isTopLevel(node.id)
    ) {
      continue;
    }
    nextLayouts[node.id] = {
      x: node.position.x,
      y: node.position.y,
      zIndex: node.zIndex,
      w: node.width,
      h: node.height,
    };
  }
  return nextLayouts;
}

export function publishNodeInternalsWithTopLevelLayout(
  host: WorkspaceHost,
  nextNodes: Map<string, Node>,
  historyChangeKind: "section-move" | null,
): void {
  const nodeStore = getNodeInternalsStore(host);
  const currentNodes = nodeStore.getState().x;
  const documentStore = getWorkspaceDocumentStore(host);
  const documentState = documentStore.getState();
  const nextLayouts = createTopLevelLayouts(documentState, nextNodes);
  if (topLevelLayoutsEqual(documentState.topLevelSections, nextLayouts)) {
    if (nextNodes !== currentNodes) {
      nodeStore.setState({ x: nextNodes });
    }
    return;
  }
  const nextDocument = {
    ...documentState,
    topLevelSections: nextLayouts,
  };
  runWithAtomicallyPublishedWorkspaceStores(
    host,
    {
      activeSections: getActiveSectionsStore(host).getState(),
      document: nextDocument,
      nodeInternals: { x: nextNodes },
    },
    () => {
      if (nextNodes !== currentNodes) {
        nodeStore.setState({ x: nextNodes });
      }
      documentStore.setState(nextDocument);
    },
  );
  notifyWorkspaceDocumentChange(host, historyChangeKind);
}
