import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";
import type { Node, TopLevelSectionLayout, Viewport, WorkspaceSection } from "./types";

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

export const useWorkspaceDocument = createWithEqualityFn(
  withResetFn<WorkspaceDocumentState>(() => ({
    sections: {},
    topLevelSections: {},
    viewport: null,
    parentSectionMap: {},
  })),
);

export const useNodeInternals = createWithEqualityFn(
  withResetFn<NodeInternalsState>(() => ({
    x: new Map(),
  })),
);

export const useActiveSections = createWithEqualityFn(
  withResetFn<ActiveSectionsState>(() => ({
    activeIds: [],
  })),
);

export const useWorkspaceAppearance = createWithEqualityFn(
  withResetFn<WorkspaceAppearanceState>(() => ({
    colorMode: "light",
    darkMode: false,
  })),
);

type AtomicallyPublishedWorkspaceStoreState = {
  document: ReturnType<typeof useWorkspaceDocument.getState>;
  nodeInternals: ReturnType<typeof useNodeInternals.getState>;
  activeSections: ReturnType<typeof useActiveSections.getState>;
};

let stagedWorkspaceStorePublication: AtomicallyPublishedWorkspaceStoreState | null = null;

function patchPublishedWorkspaceStoreGetState<TState>(
  store: { getState: () => TState },
  readRawState: () => TState,
  getPublishedState: (publication: AtomicallyPublishedWorkspaceStoreState) => TState,
) {
  store.getState = () => {
    const publication = stagedWorkspaceStorePublication;
    if (publication !== null) {
      return getPublishedState(publication);
    }
    return readRawState();
  };
}

const readRawWorkspaceDocumentState = useWorkspaceDocument.getState.bind(useWorkspaceDocument);
const readRawNodeInternalsState = useNodeInternals.getState.bind(useNodeInternals);
const readRawActiveSectionsState = useActiveSections.getState.bind(useActiveSections);

patchPublishedWorkspaceStoreGetState(
  useWorkspaceDocument,
  readRawWorkspaceDocumentState,
  (publication) => publication.document,
);
patchPublishedWorkspaceStoreGetState(
  useNodeInternals,
  readRawNodeInternalsState,
  (publication) => publication.nodeInternals,
);
patchPublishedWorkspaceStoreGetState(
  useActiveSections,
  readRawActiveSectionsState,
  (publication) => publication.activeSections,
);

// Stages the next canonical state so any getState() read that fires while fn() publishes the
// individual stores observes the document, derived node geometry, and selection together —
// never a mid-publication mixture.
export function runWithAtomicallyPublishedWorkspaceStores(
  nextState: {
    document: WorkspaceDocumentState;
    nodeInternals: NodeInternalsState;
    activeSections: ActiveSectionsState;
  },
  fn: () => void,
) {
  const previousPublication = stagedWorkspaceStorePublication;
  stagedWorkspaceStorePublication = {
    document: { ...readRawWorkspaceDocumentState(), ...nextState.document },
    nodeInternals: {
      ...readRawNodeInternalsState(),
      ...nextState.nodeInternals,
    },
    activeSections: {
      ...readRawActiveSectionsState(),
      ...nextState.activeSections,
    },
  };
  try {
    fn();
  } finally {
    stagedWorkspaceStorePublication = previousPublication;
  }
}
