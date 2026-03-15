import _ from "lodash";
import {
  NULL_PROJECT_CONFIG_ID,
  PendingOperation,
  useNodeInternals,
  usePendingOperations,
  useProjectState,
  useShareSession,
  ZustandProjectState,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_set_top_level_section_layout } from "utils/generatedEndpoints";
import { createNewId } from "utils/idNameCreation";
import {
  acknowledgePendingProjectStateOperation,
  addPendingProjectStateOperation,
  isResponseDataAndStatus,
  removePendingProjectStateOperation,
} from "./projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "./sectionInfos";
import {
  createTopLevelSectionLayoutDict,
  getActiveViewModeTopLevelSections,
  TopLevelSectionLayoutMap,
} from "./topLevelSectionLayouts";

const pendingTopLevelLayoutRef: {
  opId: string | null;
  snapshot: TopLevelSectionLayoutMap | null;
  hasQueuedSend: boolean;
} = {
  opId: null,
  snapshot: null,
  hasQueuedSend: false,
};

function applyPendingTopLevelLayout(state: ZustandProjectState) {
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

const sendTopLevelLayoutToBackend = _.debounce(() => {
  if (!pendingTopLevelLayoutRef.opId || !pendingTopLevelLayoutRef.snapshot) {
    return;
  }
  const opId = pendingTopLevelLayoutRef.opId;
  const snapshot = pendingTopLevelLayoutRef.snapshot;
  pendingTopLevelLayoutRef.hasQueuedSend = false;
  const projectConfigId = getCurrProjectConfigId();
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    removePendingProjectStateOperation(opId);
    if (pendingTopLevelLayoutRef.opId === opId) {
      pendingTopLevelLayoutRef.opId = null;
    }
    pendingTopLevelLayoutRef.snapshot = null;
    return;
  }
  const result = route_set_top_level_section_layout({
    projectConfigId,
    topLevelSections: snapshot,
    frontendOpId: opId,
  });
  if (result instanceof Promise) {
    void result.then((res) => {
      if (isResponseDataAndStatus(res) && res200(res)) {
        acknowledgePendingProjectStateOperation(opId);
      } else if (isResponseDataAndStatus(res) && res.hasResponse) {
        removePendingProjectStateOperation(opId);
        if (pendingTopLevelLayoutRef.opId === opId) {
          pendingTopLevelLayoutRef.opId = null;
        }
      }
    });
  }
}, 500);

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
  if (pendingTopLevelLayoutRef.opId) {
    const pendingOps = usePendingOperations.getState().pending;
    const stillPending = pendingOps.some(
      (opInfo) => opInfo.opId === pendingTopLevelLayoutRef.opId,
    );
    if (!stillPending) {
      pendingTopLevelLayoutRef.opId = null;
    }
  }
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
    pendingTopLevelLayoutRef.opId = addPendingProjectStateOperation(
      applyPendingTopLevelLayout,
    );
  }
  sendTopLevelLayoutToBackend();
}
