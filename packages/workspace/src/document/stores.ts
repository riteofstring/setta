import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";
import type { Node, TopLevelSectionLayout, Viewport, WorkspaceSection } from "./types";

export type WorkspaceDocumentState = {
  sections: Record<string, WorkspaceSection>;
  topLevelSections: Record<string, TopLevelSectionLayout>;
  viewport: Viewport;
  parentSectionMap: Record<string, string>;
};

export type NodeInternalsState = { x: Map<string, Node> };

export type ActiveSectionsState = { activeIds: Array<string> };

export type WorkspaceAppearanceState = { darkMode: boolean };

export const useWorkspaceDocument = createWithEqualityFn(
  withResetFn<WorkspaceDocumentState>(() => ({
    sections: {},
    topLevelSections: {},
    viewport: { x: 0, y: 0, zoom: 1 },
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
