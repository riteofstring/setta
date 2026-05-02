import type { ResponseDataAndStatus } from "@setta/app-subsystem-frontend-sdk";

import {
  callOpenAPI,
  createNewId,
  res200,
} from "@setta/app-subsystem-frontend-sdk";

import { clearNodesSelectionBounds } from "gpuFlow/selectionBounds";

import { getViewport as getGpuViewport } from "gpuFlow/viewportActions";

import { gpuFlowViewportStore } from "gpuFlow/viewportStore";

import _ from "lodash";

import {
  groupSections,
  setTopLevelSectionLayout,
  setViewport,
  toggleParamSelected as toggleParamSelectedRequest,
  ungroupGroups,
  unselectAllParams as unselectAllParamsRequest,
} from "openapi/http";

import { getActiveSectionUIIds } from "state/activeSectionUI";

import {
  NULL_PROJECT_CONFIG_ID,
  PendingOperation,
  useAllProjectMetadata,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  useShareSession,
  ZustandProjectState,
} from "state/definitions";

import {
  AllProjectMetadata,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  Viewport,
} from "utils/generatedTypes";

import { applyActiveSectionChange } from "../activeSectionController";

import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  setCurrEffectiveSectionImplValue,
} from "./projectStateCore";

import {
  createTopLevelSectionLayoutDict,
  getActiveViewModeTopLevelSections,
  TopLevelSectionLayoutMap,
} from "./codeObjectsAndLayout";

export type PendingViewportState = Viewport | null;

export const pendingViewportRef: {
  opId: string | null;
  snapshot: PendingViewportState;
  hasQueuedSend: boolean;
} = {
  opId: null,
  snapshot: null,
  hasQueuedSend: false,
};

export function applyViewportSnapshotToProjectState(
  state: ZustandProjectState,
  viewport: PendingViewportState,
) {
  state.projectConfig.viewport = viewport;
  state.projectConfig.viewportInitialized = viewport !== null;
  const { activeViewModeId, viewModes } = state.projectConfig;
  if (!activeViewModeId) {
    return;
  }
  const activeViewMode = viewModes[activeViewModeId];
  if (!activeViewMode) {
    return;
  }
  activeViewMode.viewport = viewport;
  activeViewMode.viewportInitialized = viewport !== null;
}

export function applyPendingViewport(state: ZustandProjectState) {
  applyViewportSnapshotToProjectState(state, pendingViewportRef.snapshot);
}

export const pendingTopLevelLayoutRef: {
  opId: string | null;
  snapshot: TopLevelSectionLayoutMap | null;
  hasQueuedSend: boolean;
} = {
  opId: null,
  snapshot: null,
  hasQueuedSend: false,
};

export function applyPendingTopLevelLayout(state: ZustandProjectState) {
  if (!pendingTopLevelLayoutRef.snapshot) {
    return;
  }
  const currentLayouts = state.projectConfig.topLevelSections;
  const { activeViewModeId, viewModes } = state.projectConfig;
  const viewModeLayouts =
    activeViewModeId && viewModes[activeViewModeId]
      ? viewModes[activeViewModeId].topLevelSections
      : null;
  for (const [sectionId, layout] of Object.entries(
    pendingTopLevelLayoutRef.snapshot,
  )) {
    if (!(sectionId in currentLayouts)) {
      continue;
    }
    currentLayouts[sectionId] = layout;
    if (viewModeLayouts) {
      viewModeLayouts[sectionId] = layout;
    }
  }
}

export const sendTopLevelLayoutToBackend = _.debounce(() => {
  if (!pendingTopLevelLayoutRef.opId || !pendingTopLevelLayoutRef.snapshot) {
    return;
  }
  const opId = pendingTopLevelLayoutRef.opId;
  const snapshot = pendingTopLevelLayoutRef.snapshot;
  pendingTopLevelLayoutRef.hasQueuedSend = false;
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    removePendingOp(opId);
    if (pendingTopLevelLayoutRef.opId === opId) {
      pendingTopLevelLayoutRef.opId = null;
    }
    pendingTopLevelLayoutRef.snapshot = null;
    return;
  }
  const result = callOpenAPI(
    setTopLevelSectionLayout({
      body: {
        projectConfigId,
        topLevelSections: snapshot,
        frontendOpId: opId,
      },
    } as Parameters<typeof setTopLevelSectionLayout>[0]),
  );
  if (result instanceof Promise) {
    void result.then((res) => {
      if (isResponseDataAndStatus(res) && res200(res)) {
        acknowledgePendingOp(opId);
      } else if (isResponseDataAndStatus(res) && res.hasResponse) {
        removePendingOp(opId);
        if (pendingTopLevelLayoutRef.opId === opId) {
          pendingTopLevelLayoutRef.opId = null;
        }
      }
    });
  }
}, 500);

export const sendViewportToBackend = _.debounce(() => {
  if (!pendingViewportRef.opId) {
    return;
  }
  const opId = pendingViewportRef.opId;
  const snapshot = pendingViewportRef.snapshot;
  pendingViewportRef.hasQueuedSend = false;
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    removePendingOp(opId);
    if (pendingViewportRef.opId === opId) {
      pendingViewportRef.opId = null;
    }
    pendingViewportRef.snapshot = null;
    return;
  }
  const result = callOpenAPI(
    setViewport({
      body: {
        projectConfigId,
        viewport: snapshot,
        frontendOpId: opId,
      },
    } as Parameters<typeof setViewport>[0]),
  );
  if (result instanceof Promise) {
    void result.then((res) => {
      if (isResponseDataAndStatus(res) && res200(res)) {
        acknowledgePendingOp(opId);
      } else if (isResponseDataAndStatus(res) && res.hasResponse) {
        removePendingOp(opId);
        if (pendingViewportRef.opId === opId) {
          pendingViewportRef.opId = null;
        }
      }
    });
  }
}, 1000);

export function reconcilePendingTopLevelLayout(
  nextPending: PendingOperation[],
) {
  const currentOpId = pendingTopLevelLayoutRef.opId;
  if (!currentOpId) {
    return;
  }
  const stillPending = nextPending.some((op) => op.opId === currentOpId);
  if (stillPending) {
    return;
  }
  if (
    pendingTopLevelLayoutRef.hasQueuedSend &&
    pendingTopLevelLayoutRef.snapshot
  ) {
    const opId = createNewId();
    pendingTopLevelLayoutRef.opId = opId;
    nextPending.push({
      opId,
      apply: applyPendingTopLevelLayout,
      acknowledged: false,
    });
    return;
  }
  pendingTopLevelLayoutRef.opId = null;
  pendingTopLevelLayoutRef.snapshot = null;
  pendingTopLevelLayoutRef.hasQueuedSend = false;
}

export function reconcilePendingViewport(nextPending: PendingOperation[]) {
  const currentOpId = pendingViewportRef.opId;
  if (!currentOpId) {
    return;
  }
  const stillPending = nextPending.some((op) => op.opId === currentOpId);
  if (stillPending) {
    return;
  }
  if (pendingViewportRef.hasQueuedSend) {
    const opId = createNewId();
    pendingViewportRef.opId = opId;
    nextPending.push({
      opId,
      apply: applyPendingViewport,
      acknowledged: false,
    });
    return;
  }
  pendingViewportRef.opId = null;
  pendingViewportRef.snapshot = null;
  pendingViewportRef.hasQueuedSend = false;
}

export function debounced_route_set_top_level_section_layout() {
  const shareSession = useShareSession.getState();
  if (
    shareSession.isDeploymentMode &&
    shareSession.sharePolicy?.allowLayoutChanges === false
  ) {
    return;
  }
  if (getCurrProjectConfigId() === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  const projectState = useProjectState.getState();
  const parentSectionMap = projectState.parentSectionMap;
  const existingLayoutsRaw = getActiveViewModeTopLevelSections(projectState);
  const existingLayouts = Object.fromEntries(
    Object.entries(existingLayoutsRaw).filter(([sectionId]) => {
      const parentId = parentSectionMap[sectionId] ?? null;
      return parentId === null;
    }),
  );
  const nodeInternalsRaw = useNodeInternals.getState().x;
  const nodeInternals: typeof nodeInternalsRaw = new Map(
    Array.from(nodeInternalsRaw.entries()).filter(([sectionId]) => {
      const parentId = parentSectionMap[sectionId] ?? null;
      return parentId === null;
    }),
  );
  const topLevelSections = createTopLevelSectionLayoutDict(
    projectState.sections,
    nodeInternals,
    existingLayouts,
  );
  clearCompletedPendingOpId(pendingTopLevelLayoutRef);
  pendingTopLevelLayoutRef.snapshot = topLevelSections;
  pendingTopLevelLayoutRef.hasQueuedSend = true;
  useProjectState.setState((state) => {
    state.projectConfig.topLevelSections = topLevelSections;
    const { activeViewModeId, viewModes } = state.projectConfig;
    if (activeViewModeId && viewModes[activeViewModeId]) {
      viewModes[activeViewModeId].topLevelSections = topLevelSections;
    }
  });
  if (!pendingTopLevelLayoutRef.opId) {
    pendingTopLevelLayoutRef.opId = addPendingOp(applyPendingTopLevelLayout);
  }
  sendTopLevelLayoutToBackend();
}

export function getCurrProjectConfigId() {
  return useProjectState.getState().projectConfig.id;
}

export function getCurrProjectConfigViewport() {
  return gpuFlowViewportStore.getState().fitViewOnInit
    ? null
    : getGpuViewport();
}

export function getSectionChildren(
  state: ZustandProjectState,
  parentId: string,
) {
  return getCurrEffectiveSectionImplWithTypeGuard(
    state,
    parentId,
    isBaseParentSectionImpl,
  ).children;
}

export async function groupActiveSections() {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return;
  }
  const sectionIds = getActiveSectionUIIds();
  callOpenAPI(
    groupSections({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sectionIds,
      },
    } as Parameters<typeof groupSections>[0]),
  );
  clearNodesSelectionBounds();
}

export async function ungroupActiveGroups() {
  const shareSession = useShareSession.getState();
  if (shareSession.isDeploymentMode) {
    return;
  }
  const groupIds = getActiveSectionUIIds();
  callOpenAPI(
    ungroupGroups({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        groupIds,
      },
    } as Parameters<typeof ungroupGroups>[0]),
  );
}

export function addPendingOp(apply: (x: ZustandProjectState) => void) {
  const opId = createNewId();
  usePendingOperations.setState((state) => ({
    pending: [...state.pending, { apply, opId, acknowledged: false }],
  }));
  return opId;
}

export function acknowledgePendingOp(opId: string) {
  // Mark as acknowledged so stale optimistic ops don't override later backend syncs.
  usePendingOperations.setState((state) => {
    const index = state.pending.findIndex((opInfo) => opInfo.opId === opId);
    if (index < 0 || state.pending[index].acknowledged) {
      return state;
    }
    const nextPending = [...state.pending];
    nextPending[index] = {
      ...nextPending[index],
      acknowledged: true,
    };
    return { pending: nextPending };
  });
}

export function removePendingOp(opId: string) {
  usePendingOperations.setState((state) => ({
    pending: state.pending.filter((opInfo) => opInfo.opId !== opId),
  }));
}

export function isPendingOpQueued(opId: string | null): boolean {
  return (
    opId !== null &&
    usePendingOperations
      .getState()
      .pending.some((opInfo) => opInfo.opId === opId)
  );
}

export function clearCompletedPendingOpId(ref: { opId: string | null }) {
  if (ref.opId && !isPendingOpQueued(ref.opId)) {
    ref.opId = null;
  }
}

export function removePendingOpAndGetReplayOps(
  opId: string,
): Array<PendingOperation> {
  const pendingBeforeRemoval = usePendingOperations.getState().pending;
  const failedOpIndex = pendingBeforeRemoval.findIndex(
    (opInfo) => opInfo.opId === opId,
  );
  removePendingOp(opId);
  if (failedOpIndex < 0) {
    return [];
  }
  const remainingOpIds = new Set(
    usePendingOperations.getState().pending.map((opInfo) => opInfo.opId),
  );
  return pendingBeforeRemoval
    .slice(failedOpIndex + 1)
    .filter((opInfo) => remainingOpIds.has(opInfo.opId));
}

export function rollbackOptimisticProjectStateUpdate(
  opId: string,
  rollback?: (state: ZustandProjectState) => void,
) {
  const replayOps = removePendingOpAndGetReplayOps(opId);
  if (!rollback) {
    return;
  }
  useProjectState.setState((state) => {
    rollback(state);
    for (const opInfo of replayOps) {
      opInfo.apply(state);
    }
  });
}

export function applyOptimisticProjectStateUpdateIfProjectMatches(
  state: ZustandProjectState,
  projectConfigId: string | undefined,
  update: (state: ZustandProjectState) => void,
) {
  if (
    projectConfigId !== undefined &&
    state.projectConfig.id !== projectConfigId
  ) {
    return;
  }
  update(state);
}

export function isResponseDataAndStatus(
  value: unknown,
): value is ResponseDataAndStatus<unknown> {
  // Narrow unknown send results without relying on try/catch for control flow.
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "hasResponse" in value
  );
}

export function dispatchOptimisticProjectStateUpdate({
  apply,
  send,
  rollback,
  reapply,
  projectConfigId,
}: {
  apply: (state: ZustandProjectState) => void;
  send: (frontendOpId: string) => void | Promise<unknown>;
  rollback?: (state: ZustandProjectState) => void;
  reapply?: (state: ZustandProjectState) => void;
  projectConfigId?: string;
}) {
  const { opId, result } = dispatchOptimisticProjectStateUpdateWithResult({
    apply,
    send,
    rollback,
    reapply,
    projectConfigId,
  });
  void result.catch(() => {});
  return opId;
}

export function dispatchOptimisticProjectStateUpdateWithResult<T>({
  apply,
  send,
  rollback,
  reapply,
  projectConfigId,
}: {
  apply: (state: ZustandProjectState) => void;
  send: (frontendOpId: string) => T | Promise<T>;
  rollback?: (state: ZustandProjectState) => void;
  reapply?: (state: ZustandProjectState) => void;
  projectConfigId?: string;
}) {
  const applyWithProjectGuard = (state: ZustandProjectState) =>
    applyOptimisticProjectStateUpdateIfProjectMatches(
      state,
      projectConfigId,
      apply,
    );
  const reapplyWithProjectGuard = (state: ZustandProjectState) =>
    applyOptimisticProjectStateUpdateIfProjectMatches(
      state,
      projectConfigId,
      reapply ?? apply,
    );
  const rollbackWithProjectGuard =
    rollback === undefined
      ? undefined
      : (state: ZustandProjectState) =>
          applyOptimisticProjectStateUpdateIfProjectMatches(
            state,
            projectConfigId,
            rollback,
          );
  useProjectState.setState(applyWithProjectGuard);
  const opId = addPendingOp(reapplyWithProjectGuard);
  const result = Promise.resolve(send(opId))
    .then((res) => {
      // A 200 response means the backend accepted the op; don't keep reapplying it.
      if (isResponseDataAndStatus(res) && res200(res)) {
        if (
          projectConfigId !== undefined &&
          useProjectState.getState().projectConfig.id !== projectConfigId
        ) {
          removePendingOp(opId);
          return res;
        }
        acknowledgePendingOp(opId);
      } else if (isResponseDataAndStatus(res)) {
        rollbackOptimisticProjectStateUpdate(opId, rollbackWithProjectGuard);
      }
      return res;
    })
    .catch((error) => {
      rollbackOptimisticProjectStateUpdate(opId, rollbackWithProjectGuard);
      throw error;
    });
  return { opId, result };
}

export function toggleParamSelected(sectionId: string, paramInfoId: string) {
  const currentState = useProjectState.getState();
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    currentState,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const wasSelected = impl.selectedParams.includes(paramInfoId);
  const nextSelectedCount = wasSelected
    ? impl.selectedParams.length - 1
    : impl.selectedParams.length + 1;
  const hasSelectedParams = nextSelectedCount > 0;
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
        state,
        sectionId,
        {
          selectedParams: (curr) => {
            if (curr?.includes(paramInfoId)) {
              return curr.filter((id) => id !== paramInfoId);
            }
            return [...(curr ?? []), paramInfoId];
          },
        },
      );
    },
    send: (frontendOpId) =>
      callOpenAPI(
        toggleParamSelectedRequest({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            paramInfoId,
            frontendOpId,
          },
        } as Parameters<typeof toggleParamSelectedRequest>[0]),
      ),
  });
  applyActiveSectionChange({
    interaction: wasSelected ? "param-unselect" : "param-select",
    sectionId,
    hasSelectedParams,
  });
}

export function unselectAllParams() {
  const currentState = useProjectState.getState();
  const sectionIds = Object.keys(currentState.sections);
  const hasSelectedParams = sectionIds.some((sectionId) => {
    const impl = getCurrEffectiveSectionImpl(currentState, sectionId);
    return (
      isBaseSectionWithParamsImpl(impl) &&
      (impl.selectedParams?.length ?? 0) > 0
    );
  });
  if (!hasSelectedParams) {
    return false;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      for (const sectionId of Object.keys(state.sections)) {
        const impl = getCurrEffectiveSectionImpl(state, sectionId);
        if (
          isBaseSectionWithParamsImpl(impl) &&
          impl.selectedParams.length > 0
        ) {
          setCurrEffectiveSectionImplValue<"BaseSectionWithParams">(
            state,
            sectionId,
            { selectedParams: [] },
          );
        }
      }
    },
    send: (frontendOpId) =>
      callOpenAPI(
        unselectAllParamsRequest({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            frontendOpId,
          },
        } as Parameters<typeof unselectAllParamsRequest>[0]),
      ),
  });
  return true;
}

export function updateAllProjectMetadata(x: AllProjectMetadata) {
  useAllProjectMetadata.setState({
    ...x,
    projectMetadata: x.projectMetadata ?? [],
  });
}

export function shouldSkipViewportDispatch(
  viewport: PendingViewportState,
  currentProjectState: ZustandProjectState,
): boolean {
  const snapshotUnchanged = _.isEqual(pendingViewportRef.snapshot, viewport);
  const currentMatches =
    _.isEqual(currentProjectState.projectConfig.viewport, viewport) &&
    currentProjectState.projectConfig.viewportInitialized ===
      (viewport !== null);
  return (
    !pendingViewportRef.hasQueuedSend &&
    !pendingViewportRef.opId &&
    snapshotUnchanged &&
    currentMatches
  );
}

export function dispatchViewportUpdate(
  viewport: Viewport | null,
  immediate = false,
) {
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return;
  }
  clearCompletedPendingOpId(pendingViewportRef);
  const currentProjectState = useProjectState.getState();
  if (shouldSkipViewportDispatch(viewport, currentProjectState)) {
    return;
  }
  pendingViewportRef.snapshot = viewport;
  pendingViewportRef.hasQueuedSend = true;
  if (immediate) {
    useProjectState.setState((state) => {
      applyViewportSnapshotToProjectState(state, viewport);
    });
  }
  if (!pendingViewportRef.opId) {
    pendingViewportRef.opId = addPendingOp(applyPendingViewport);
  }
  sendViewportToBackend();
  if (immediate) {
    sendViewportToBackend.flush();
  }
}

export const debouncedDispatchViewportUpdate = Object.assign(
  () => dispatchViewportUpdate(getCurrProjectConfigViewport()),
  {
    cancel: () => {
      sendViewportToBackend.cancel();
    },
    flush: () => {
      sendViewportToBackend.flush();
    },
  },
);

export function dispatchViewportUpdateImmediately() {
  debouncedDispatchViewportUpdate.cancel();
  dispatchViewportUpdate(getCurrProjectConfigViewport(), true);
}
