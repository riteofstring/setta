import { Node } from "forks/xyflow/core/types";
import { subscribeWithSelector } from "zustand/middleware";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "../utils";
import { useProjectState, type ZustandProjectState } from "./projectStores";

export type ActiveSectionUIState = {
  activeIds: Array<string>;
  selectionGeneration: number;
  backendGeneration: number;
  backendHydrationEnabled: boolean;
  pendingBackendSyncOpIds: Array<string>;
  pendingBackendSyncGenerationByOpId: Record<string, number>;
  scheduledBackendSync: {
    projectConfigId: string;
    activeIds: Array<string>;
    generation: number;
  } | null;
};

export const useActiveSectionUI = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(
      withResetFn<ActiveSectionUIState>(() => ({
        activeIds: [],
        selectionGeneration: 0,
        backendGeneration: 0,
        backendHydrationEnabled: true,
        pendingBackendSyncOpIds: [],
        pendingBackendSyncGenerationByOpId: {},
        scheduledBackendSync: null,
      })),
    ),
  ),
);

export type ZustandNodeInternalsState = { x: Map<string, Node> };

export const useNodeInternals = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandNodeInternalsState>(() => ({
      x: new Map(),
    })),
  ),
);

type AtomicallyPublishedProjectStoreState = {
  projectState: ZustandProjectState;
  nodeInternals: ZustandNodeInternalsState;
  activeSectionUI: ActiveSectionUIState;
};

let stagedProjectStorePublication: AtomicallyPublishedProjectStoreState | null =
  null;

function patchPublishedProjectStoreGetState<TState>(
  store: {
    getState: () => TState;
  },
  readRawState: () => TState,
  getPublishedState: (
    publication: AtomicallyPublishedProjectStoreState,
  ) => TState,
) {
  store.getState = (() => {
    const publication = stagedProjectStorePublication;
    if (publication !== null) {
      return getPublishedState(publication);
    }
    return readRawState();
  }) as typeof store.getState;
}

const readRawProjectState = useProjectState.getState.bind(useProjectState);
const readRawActiveSectionUIState =
  useActiveSectionUI.getState.bind(useActiveSectionUI);
const readRawNodeInternalsState =
  useNodeInternals.getState.bind(useNodeInternals);

patchPublishedProjectStoreGetState(
  useProjectState,
  readRawProjectState,
  (publication) => publication.projectState,
);
patchPublishedProjectStoreGetState(
  useActiveSectionUI,
  readRawActiveSectionUIState,
  (publication) => publication.activeSectionUI,
);
patchPublishedProjectStoreGetState(
  useNodeInternals,
  readRawNodeInternalsState,
  (publication) => publication.nodeInternals,
);

export function runWithAtomicallyPublishedProjectStores(
  nextState: {
    projectState: ZustandProjectState;
    nodeInternals: ZustandNodeInternalsState;
    activeSectionUI?: Partial<ActiveSectionUIState> | null;
  },
  fn: () => void,
) {
  const previousPublication = stagedProjectStorePublication;
  stagedProjectStorePublication = {
    projectState: nextState.projectState,
    nodeInternals: nextState.nodeInternals,
    activeSectionUI:
      nextState.activeSectionUI === null ||
      typeof nextState.activeSectionUI === "undefined"
        ? readRawActiveSectionUIState()
        : {
            ...readRawActiveSectionUIState(),
            ...nextState.activeSectionUI,
          },
  };
  try {
    fn();
  } finally {
    stagedProjectStorePublication = previousPublication;
  }
}
