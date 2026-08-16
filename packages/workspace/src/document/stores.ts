import { createStore, type StoreApi } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import type {
  Node,
  TopLevelSectionLayout,
  Viewport,
  WorkspaceSection,
} from "./types";

export type WorkspaceDocumentState = {
  sections: Record<string, WorkspaceSection>;
  topLevelSections: Record<string, TopLevelSectionLayout>;
  // null means the document carries no saved camera; the canvas then fits the content on init,
  // mirroring the reference's no-saved-viewport load path.
  viewport: Viewport | null;
  parentSectionMap: Record<string, string>;
};

export type NodeInternalsState = { x: Map<string, Node> };

export type ActiveSectionsState = { activeIds: Array<string> };

export type WorkspaceColorMode = "light" | "dark" | "system";

export type WorkspaceAppearanceState = {
  colorMode: WorkspaceColorMode;
  // Resolved appearance. Consumers read this value for host chrome; color-mode changes go
  // through setWorkspaceColorMode so system preference changes and node projection stay synced.
  darkMode: boolean;
};

function createWorkspaceDocumentStore() {
  return createStore(
    withResetFn<WorkspaceDocumentState>(() => ({
    sections: {},
    topLevelSections: {},
    viewport: null,
    parentSectionMap: {},
    })),
  );
}

function createNodeInternalsStore() {
  return createStore(
    withResetFn<NodeInternalsState>(() => ({
    x: new Map(),
    })),
  );
}

function createActiveSectionsStore() {
  return createStore(
    withResetFn<ActiveSectionsState>(() => ({
    activeIds: [],
    })),
  );
}

function createWorkspaceAppearanceStore() {
  return createStore(
    withResetFn<WorkspaceAppearanceState>(() => ({
    colorMode: "light",
    darkMode: false,
    })),
  );
}

type AtomicallyPublishedWorkspaceStoreState = {
  document: WorkspaceDocumentState;
  nodeInternals: NodeInternalsState;
  activeSections: ActiveSectionsState;
};

type WorkspaceStoreSet = {
  activeSections: StoreApi<ActiveSectionsState & { reset: () => void }>;
  appearance: StoreApi<WorkspaceAppearanceState & { reset: () => void }>;
  document: StoreApi<WorkspaceDocumentState & { reset: () => void }>;
  nodeInternals: StoreApi<NodeInternalsState & { reset: () => void }>;
  stagedPublication: AtomicallyPublishedWorkspaceStoreState | null;
};

const storeSetsByHost = new WeakMap<WorkspaceHost, WorkspaceStoreSet>();

function patchPublishedWorkspaceStoreGetState<TState>(
  store: { getState: () => TState },
  readRawState: () => TState,
  getPublishedState: (publication: AtomicallyPublishedWorkspaceStoreState) => TState,
  getStagedPublication: () => AtomicallyPublishedWorkspaceStoreState | null,
) {
  store.getState = () => {
    const publication = getStagedPublication();
    if (publication !== null) {
      return getPublishedState(publication);
    }
    return readRawState();
  };
}

function createWorkspaceStoreSet(): WorkspaceStoreSet {
  const document = createWorkspaceDocumentStore();
  const nodeInternals = createNodeInternalsStore();
  const activeSections = createActiveSectionsStore();
  const appearance = createWorkspaceAppearanceStore();
  const stores: WorkspaceStoreSet = {
    activeSections,
    appearance,
    document,
    nodeInternals,
    stagedPublication: null,
  };
  const readRawWorkspaceDocumentState = document.getState.bind(document);
  const readRawNodeInternalsState = nodeInternals.getState.bind(nodeInternals);
  const readRawActiveSectionsState = activeSections.getState.bind(activeSections);
  patchPublishedWorkspaceStoreGetState(
    document,
    readRawWorkspaceDocumentState,
    (publication) => publication.document,
    () => stores.stagedPublication,
  );
  patchPublishedWorkspaceStoreGetState(
    nodeInternals,
    readRawNodeInternalsState,
    (publication) => publication.nodeInternals,
    () => stores.stagedPublication,
  );
  patchPublishedWorkspaceStoreGetState(
    activeSections,
    readRawActiveSectionsState,
    (publication) => publication.activeSections,
    () => stores.stagedPublication,
  );
  return stores;
}

function getWorkspaceStoreSet(host: WorkspaceHost): WorkspaceStoreSet {
  assertWorkspaceHostActive(host);
  const existing = storeSetsByHost.get(host);
  if (existing) {
    return existing;
  }
  const stores = createWorkspaceStoreSet();
  storeSetsByHost.set(host, stores);
  return stores;
}

export function getWorkspaceDocumentStore(host: WorkspaceHost) {
  return getWorkspaceStoreSet(host).document;
}

export function getNodeInternalsStore(host: WorkspaceHost) {
  return getWorkspaceStoreSet(host).nodeInternals;
}

export function getActiveSectionsStore(host: WorkspaceHost) {
  return getWorkspaceStoreSet(host).activeSections;
}

export function getWorkspaceAppearanceStore(host: WorkspaceHost) {
  return getWorkspaceStoreSet(host).appearance;
}

export function useWorkspaceDocument<T>(
  selector: (state: WorkspaceDocumentState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getWorkspaceDocumentStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

export function useNodeInternals<T>(
  selector: (state: NodeInternalsState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getNodeInternalsStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

export function useActiveSections<T>(
  selector: (state: ActiveSectionsState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getActiveSectionsStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

export function useWorkspaceAppearance<T>(
  selector: (state: WorkspaceAppearanceState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getWorkspaceAppearanceStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

// Stages the next canonical state so any getState() read that fires while fn() publishes the
// individual stores observes the document, derived node geometry, and selection together —
// never a mid-publication mixture.
export function runWithAtomicallyPublishedWorkspaceStores(
  host: WorkspaceHost,
  nextState: {
    document: WorkspaceDocumentState;
    nodeInternals: NodeInternalsState;
    activeSections: ActiveSectionsState;
  },
  fn: () => void,
) {
  const stores = getWorkspaceStoreSet(host);
  const previousPublication = stores.stagedPublication;
  stores.stagedPublication = {
    document: { ...stores.document.getState(), ...nextState.document },
    nodeInternals: {
      ...stores.nodeInternals.getState(),
      ...nextState.nodeInternals,
    },
    activeSections: {
      ...stores.activeSections.getState(),
      ...nextState.activeSections,
    },
  };
  try {
    fn();
  } finally {
    stores.stagedPublication = previousPublication;
  }
}
