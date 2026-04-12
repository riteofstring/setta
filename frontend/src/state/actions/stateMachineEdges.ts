import type { Connection } from "forks/xyflow/core/types";
import {
  createStateMachineEdge,
  deleteStateMachineEdges,
  setStateMachineEdges,
  updateStateMachineEdge,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { addTemporaryNotification } from "state/actions/notifications";
import { useProjectState, useShareSession } from "state/definitions";
import type { ResponseDataAndStatus } from "utils/endpointUtils";
import {
  SectionTypeEnum,
  StateMachineUIConfig,
  type SingleConfig,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { clearActiveSectionIds } from "./activeSections";
import { isSharedChatHandleId } from "./chatSharedHandleIds";
import {
  dispatchOptimisticProjectStateUpdate,
  dispatchOptimisticProjectStateUpdateWithResult,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "./sectionInfos";
import {
  getConnectionDebugPayload,
  logWorkflowDebug,
} from "./stateMachineDebug";
export const STATE_MACHINE_EDGE_HANDLE_IDS = {
  source: "workflow-source",
  target: "workflow-target",
  reverseStart: "workflow-reverse-start",
} as const;
type WorkflowEdge = SingleConfig["projectConfig"]["stateMachineEdges"][number];
type WorkflowSourceFilter = NonNullable<WorkflowEdge["sourceFilter"]>;
type WorkflowTargetAction = NonNullable<WorkflowEdge["targetAction"]>;
type WorkflowSectionInfo = {
  type: SectionTypeEnum | null;
  machineGroupId: string | null;
};
type WorkflowMachineGroupTransition = {
  machineGroupId: string | null;
  mergedMachineGroupIds: string[];
};
type WorkflowMachineGroupMergeSnapshot = {
  edgeMachineGroupById: Record<string, string>;
  sectionMachineGroupById: Record<string, string>;
};
type WorkflowEdgeMutationResponse = ResponseDataAndStatus<null>;
const WORKFLOW_CONNECTION_SOURCE_TYPES = new Set(
  StateMachineUIConfig.connectionSourceTypes,
);
const WORKFLOW_CONNECTION_TARGET_TYPES = new Set(
  StateMachineUIConfig.connectionTargetTypes,
);
const WORKFLOW_SELF_LOOP_SECTION_TYPES = new Set(
  StateMachineUIConfig.selfLoopSectionTypes,
);

function getWorkflowSectionMachineGroupId(
  state: SingleConfig,
  sectionId: string,
): string | null {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  switch (impl.type) {
    case SectionTypeEnum.StateMachineStart:
    case SectionTypeEnum.StateMachineGate:
    case SectionTypeEnum.StateMachineEnd:
      return impl.machineGroupId;
    default:
      return null;
  }
}

function setWorkflowSectionMachineGroup(
  state: SingleConfig,
  sectionId: string,
  machineGroupId: string,
): void {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  switch (impl.type) {
    case SectionTypeEnum.StateMachineStart:
      setCurrEffectiveSectionImplValue<"StateMachineStartSection">(
        state,
        sectionId,
        { machineGroupId },
      );
      return;
    case SectionTypeEnum.StateMachineGate:
      setCurrEffectiveSectionImplValue<"StateMachineGateSection">(
        state,
        sectionId,
        { machineGroupId },
      );
      return;
    case SectionTypeEnum.StateMachineEnd:
      setCurrEffectiveSectionImplValue<"StateMachineEndSection">(
        state,
        sectionId,
        { machineGroupId },
      );
      return;
  }
}

function getWorkflowSectionInfo(
  state: SingleConfig,
  sectionId: string,
): WorkflowSectionInfo {
  if (!(sectionId in state.projectConfig.sectionVariantMap)) {
    return { type: null, machineGroupId: null };
  }
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (
    impl.type === SectionTypeEnum.StateMachineStart ||
    impl.type === SectionTypeEnum.StateMachineGate ||
    impl.type === SectionTypeEnum.StateMachineEnd
  ) {
    return {
      type: impl.type,
      machineGroupId: impl.machineGroupId,
    };
  }
  return {
    type: impl.type ?? null,
    machineGroupId: null,
  };
}
function hasWorkflowHandles(connection: Connection): boolean {
  const normalizedConnection = normalizeWorkflowConnectionHandles(connection);
  return (
    normalizedConnection.sourceHandle ===
      STATE_MACHINE_EDGE_HANDLE_IDS.source &&
    normalizedConnection.targetHandle === STATE_MACHINE_EDGE_HANDLE_IDS.target
  );
}
export function isWorkflowHandleId(
  handleId: string | null | undefined,
): boolean {
  return (
    handleId === STATE_MACHINE_EDGE_HANDLE_IDS.source ||
    handleId === STATE_MACHINE_EDGE_HANDLE_IDS.target ||
    handleId === STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart
  );
}
function normalizeReverseStartedWorkflowConnection(
  connection: Connection,
): Connection {
  if (connection.sourceHandle !== STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart) {
    return connection;
  }
  return {
    source: connection.target,
    sourceHandle: connection.targetHandle,
    target: connection.source,
    targetHandle: STATE_MACHINE_EDGE_HANDLE_IDS.target,
  };
}
export function normalizeWorkflowConnectionHandles(
  connection: Connection,
): Connection {
  const normalizedReverseConnection =
    normalizeReverseStartedWorkflowConnection(connection);
  return {
    ...normalizedReverseConnection,
    sourceHandle: isSharedChatHandleId(normalizedReverseConnection.sourceHandle)
      ? STATE_MACHINE_EDGE_HANDLE_IDS.source
      : normalizedReverseConnection.sourceHandle,
    targetHandle:
      normalizedReverseConnection.targetHandle ===
      STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart
        ? STATE_MACHINE_EDGE_HANDLE_IDS.target
        : isSharedChatHandleId(normalizedReverseConnection.targetHandle)
          ? STATE_MACHINE_EDGE_HANDLE_IDS.target
          : normalizedReverseConnection.targetHandle,
  };
}
function usesSharedChatHandleOnNormalizedSource(
  connection: Connection,
  normalizedConnection: Connection,
): boolean {
  return (
    (isSharedChatHandleId(connection.sourceHandle) &&
      normalizedConnection.source === connection.source) ||
    (isSharedChatHandleId(connection.targetHandle) &&
      normalizedConnection.source === connection.target)
  );
}
function usesSharedChatHandleOnNormalizedTarget(
  connection: Connection,
  normalizedConnection: Connection,
): boolean {
  return (
    (isSharedChatHandleId(connection.sourceHandle) &&
      normalizedConnection.target === connection.source) ||
    (isSharedChatHandleId(connection.targetHandle) &&
      normalizedConnection.target === connection.target)
  );
}
function getUniqueConnectedMachineGroupId(
  state: SingleConfig,
  sectionId: string,
): string | null {
  const machineGroupIds = new Set<string>();
  for (const edge of state.projectConfig.stateMachineEdges) {
    if (
      edge.sourceSectionId === sectionId ||
      edge.targetSectionId === sectionId
    ) {
      machineGroupIds.add(edge.machineGroupId);
    }
  }
  if (machineGroupIds.size !== 1) {
    return null;
  }
  const [machineGroupId] = machineGroupIds;
  return machineGroupId ?? null;
}
function resolveExistingMachineGroupIdForConnectionEndpoint(
  state: SingleConfig,
  sectionId: string,
  sectionInfo: WorkflowSectionInfo,
): string | null {
  if (sectionInfo.machineGroupId) {
    return sectionInfo.machineGroupId;
  }
  return getUniqueConnectedMachineGroupId(state, sectionId);
}
function resolveMachineGroupTransitionForConnection(
  connection: Connection,
  state: SingleConfig,
): WorkflowMachineGroupTransition {
  if (!connection.source || !connection.target) {
    return {
      machineGroupId: null,
      mergedMachineGroupIds: [],
    };
  }
  const sourceInfo = getWorkflowSectionInfo(state, connection.source);
  const targetInfo = getWorkflowSectionInfo(state, connection.target);
  const machineGroupIds = new Set<string>();
  const sourceMachineGroupId =
    resolveExistingMachineGroupIdForConnectionEndpoint(
      state,
      connection.source,
      sourceInfo,
    );
  const targetMachineGroupId =
    resolveExistingMachineGroupIdForConnectionEndpoint(
      state,
      connection.target,
      targetInfo,
    );
  if (sourceMachineGroupId) {
    machineGroupIds.add(sourceMachineGroupId);
  }
  if (targetMachineGroupId) {
    machineGroupIds.add(targetMachineGroupId);
  }
  if (machineGroupIds.size === 0) {
    return {
      machineGroupId: null,
      mergedMachineGroupIds: [],
    };
  }
  const machineGroupId = sourceMachineGroupId ?? targetMachineGroupId;
  if (!machineGroupId) {
    return {
      machineGroupId: null,
      mergedMachineGroupIds: [],
    };
  }
  return {
    machineGroupId,
    mergedMachineGroupIds: [...machineGroupIds].filter(
      (candidate) => candidate !== machineGroupId,
    ),
  };
}
function captureWorkflowMachineGroupMergeSnapshot(
  state: SingleConfig,
  mergedMachineGroupIds: string[],
): WorkflowMachineGroupMergeSnapshot {
  const mergedMachineGroupIdSet = new Set(mergedMachineGroupIds);
  const edgeMachineGroupById: Record<string, string> = {};
  for (const edge of state.projectConfig.stateMachineEdges) {
    if (mergedMachineGroupIdSet.has(edge.machineGroupId)) {
      edgeMachineGroupById[edge.id] = edge.machineGroupId;
    }
  }
  const sectionMachineGroupById: Record<string, string> = {};
  for (const sectionId of Object.keys(state.projectConfig.sectionVariantMap)) {
    const currentMachineGroupId = getWorkflowSectionMachineGroupId(
      state,
      sectionId,
    );
    if (
      currentMachineGroupId &&
      mergedMachineGroupIdSet.has(currentMachineGroupId)
    ) {
      sectionMachineGroupById[sectionId] = currentMachineGroupId;
    }
  }
  return {
    edgeMachineGroupById,
    sectionMachineGroupById,
  };
}
function applyWorkflowMachineGroupMerge(
  state: SingleConfig,
  machineGroupId: string,
  mergedMachineGroupIds: string[],
): void {
  if (mergedMachineGroupIds.length === 0) {
    return;
  }
  const mergedMachineGroupIdSet = new Set(mergedMachineGroupIds);
  for (const sectionId of Object.keys(state.projectConfig.sectionVariantMap)) {
    const currentMachineGroupId = getWorkflowSectionMachineGroupId(
      state,
      sectionId,
    );
    if (
      currentMachineGroupId &&
      mergedMachineGroupIdSet.has(currentMachineGroupId)
    ) {
      setWorkflowSectionMachineGroup(state, sectionId, machineGroupId);
    }
  }
  for (const edge of state.projectConfig.stateMachineEdges) {
    if (mergedMachineGroupIdSet.has(edge.machineGroupId)) {
      edge.machineGroupId = machineGroupId;
    }
  }
}
function restoreWorkflowMachineGroupMergeSnapshot(
  state: SingleConfig,
  snapshot: WorkflowMachineGroupMergeSnapshot,
): void {
  for (const [sectionId, machineGroupId] of Object.entries(
    snapshot.sectionMachineGroupById,
  )) {
    setWorkflowSectionMachineGroup(state, sectionId, machineGroupId);
  }
  for (const edge of state.projectConfig.stateMachineEdges) {
    const machineGroupId = snapshot.edgeMachineGroupById[edge.id];
    if (machineGroupId) {
      edge.machineGroupId = machineGroupId;
    }
  }
}
function isAllowedStateMachineConnection(
  sourceType: SectionTypeEnum | null,
  targetType: SectionTypeEnum | null,
  sourceSectionId: string,
  targetSectionId: string,
): boolean {
  if (!sourceType || !targetType) {
    return false;
  }
  if (
    !WORKFLOW_CONNECTION_SOURCE_TYPES.has(sourceType) ||
    !WORKFLOW_CONNECTION_TARGET_TYPES.has(targetType)
  ) {
    return false;
  }
  if (
    sourceSectionId === targetSectionId &&
    !WORKFLOW_SELF_LOOP_SECTION_TYPES.has(sourceType)
  ) {
    return false;
  }
  return true;
}
function createDefaultSourceFilter(
  sourceType: SectionTypeEnum | null,
): WorkflowSourceFilter | null {
  if (sourceType !== SectionTypeEnum.Chat) {
    return null;
  }
  return {
    type: "run_completed",
    signalName: null,
    payloadField: null,
    equals: null,
  };
}
function createDefaultTargetAction(
  targetType: SectionTypeEnum | null,
): WorkflowTargetAction | null {
  if (targetType !== SectionTypeEnum.Chat) {
    return null;
  }
  return {
    type: "reset_thread",
    promptTemplateId: null,
    promptSectionId: null,
    inlinePrompt: null,
    promptInputs: {},
    threadStrategy: "continue_current_thread",
    stopIfRunning: false,
    engineConfigId: null,
    agentProfileId: null,
    permissionMode: null,
    searchEnabled: null,
  };
}
function buildStateMachineEdgeForConnection(
  connection: Connection,
  state: SingleConfig,
): WorkflowEdge | null {
  const normalizedConnection = normalizeWorkflowConnectionHandles(connection);
  if (
    !normalizedConnection.source ||
    !normalizedConnection.target ||
    !hasWorkflowHandles(normalizedConnection)
  ) {
    return null;
  }
  const sourceInfo = getWorkflowSectionInfo(state, normalizedConnection.source);
  const targetInfo = getWorkflowSectionInfo(state, normalizedConnection.target);
  if (
    usesSharedChatHandleOnNormalizedSource(connection, normalizedConnection) &&
    sourceInfo.type !== SectionTypeEnum.Chat
  ) {
    return null;
  }
  if (
    usesSharedChatHandleOnNormalizedTarget(connection, normalizedConnection) &&
    targetInfo.type !== SectionTypeEnum.Chat
  ) {
    return null;
  }
  if (
    !isAllowedStateMachineConnection(
      sourceInfo.type,
      targetInfo.type,
      normalizedConnection.source,
      normalizedConnection.target,
    )
  ) {
    return null;
  }
  const machineGroupTransition = resolveMachineGroupTransitionForConnection(
    normalizedConnection,
    state,
  );
  const machineGroupId = machineGroupTransition.machineGroupId;
  if (!machineGroupId) {
    return null;
  }
  return {
    id: createNewId(),
    machineGroupId,
    sourceSectionId: normalizedConnection.source,
    sourcePortId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
    targetSectionId: normalizedConnection.target,
    targetPortId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
    sourceFilter: createDefaultSourceFilter(sourceInfo.type),
    sourceActivationCountCondition: null,
    targetAction: createDefaultTargetAction(targetInfo.type),
    style: null,
    hidden: false,
    zIndex: 0,
    selected: false,
  };
}
export function isValidStateMachineEdgeConnection(
  connection: Connection,
): boolean {
  const normalizedConnection = normalizeWorkflowConnectionHandles(connection);
  if (
    !normalizedConnection.source ||
    !normalizedConnection.target ||
    !hasWorkflowHandles(normalizedConnection)
  ) {
    return false;
  }
  if (useShareSession.getState().isDeploymentMode) {
    return false;
  }
  const state = useProjectState.getState();
  const sourceInfo = getWorkflowSectionInfo(state, normalizedConnection.source);
  const targetInfo = getWorkflowSectionInfo(state, normalizedConnection.target);
  if (
    usesSharedChatHandleOnNormalizedSource(connection, normalizedConnection) &&
    sourceInfo.type !== SectionTypeEnum.Chat
  ) {
    return false;
  }
  if (
    usesSharedChatHandleOnNormalizedTarget(connection, normalizedConnection) &&
    targetInfo.type !== SectionTypeEnum.Chat
  ) {
    return false;
  }
  if (
    !isAllowedStateMachineConnection(
      sourceInfo.type,
      targetInfo.type,
      normalizedConnection.source,
      normalizedConnection.target,
    )
  ) {
    return false;
  }
  return (
    resolveMachineGroupTransitionForConnection(normalizedConnection, state)
      .machineGroupId !== null
  );
}
export function createStateMachineEdgeFromConnection(
  connection: Connection,
): void {
  if (useShareSession.getState().isDeploymentMode) {
    logWorkflowDebug("workflow edge creation skipped in deployment mode", {
      ...getConnectionDebugPayload(connection),
    });
    return;
  }
  const state = useProjectState.getState();
  const normalizedConnection = normalizeWorkflowConnectionHandles(connection);
  const machineGroupTransition = resolveMachineGroupTransitionForConnection(
    normalizedConnection,
    state,
  );
  const nextEdge = buildStateMachineEdgeForConnection(connection, state);
  if (!nextEdge) {
    logWorkflowDebug("workflow edge creation rejected", {
      ...getConnectionDebugPayload(connection),
      normalizedConnection: getConnectionDebugPayload(normalizedConnection),
      sourceInfo: connection.source
        ? getWorkflowSectionInfo(state, connection.source)
        : null,
      targetInfo: connection.target
        ? getWorkflowSectionInfo(state, connection.target)
        : null,
      resolvedMachineGroupId: machineGroupTransition.machineGroupId,
      mergedMachineGroupIds: machineGroupTransition.mergedMachineGroupIds,
    });
    addTemporaryNotification(
      "Workflow edges require compatible workflow ports and one resolvable machine group.",
      "warning",
    );
    return;
  }
  const mergeSnapshot = captureWorkflowMachineGroupMergeSnapshot(
    state,
    machineGroupTransition.mergedMachineGroupIds,
  );
  logWorkflowDebug("workflow edge created", {
    edgeId: nextEdge.id,
    machineGroupId: nextEdge.machineGroupId,
    mergedMachineGroupIds: machineGroupTransition.mergedMachineGroupIds,
    sourceSectionId: nextEdge.sourceSectionId,
    sourcePortId: nextEdge.sourcePortId,
    targetSectionId: nextEdge.targetSectionId,
    targetPortId: nextEdge.targetPortId,
    sourceFilterType: nextEdge.sourceFilter?.type ?? null,
    targetActionType: nextEdge.targetAction?.type ?? null,
  });
  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      applyWorkflowMachineGroupMerge(
        draft,
        nextEdge.machineGroupId,
        machineGroupTransition.mergedMachineGroupIds,
      );
      if (
        draft.projectConfig.stateMachineEdges.some(
          (edge) => edge.id === nextEdge.id,
        )
      ) {
        return;
      }
      draft.projectConfig.stateMachineEdges.push(nextEdge);
    },
    rollback: (draft) => {
      draft.projectConfig.stateMachineEdges =
        draft.projectConfig.stateMachineEdges.filter(
          (edge) => edge.id !== nextEdge.id,
        );
      restoreWorkflowMachineGroupMergeSnapshot(draft, mergeSnapshot);
    },
    send: (frontendOpId) =>
      callOpenAPI(
        createStateMachineEdge({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            id: nextEdge.id,
            machineGroupId: nextEdge.machineGroupId,
            sourceSectionId: nextEdge.sourceSectionId,
            sourcePortId: nextEdge.sourcePortId,
            targetSectionId: nextEdge.targetSectionId,
            targetPortId: nextEdge.targetPortId,
            sourceFilter: nextEdge.sourceFilter,
            sourceActivationCountCondition:
              nextEdge.sourceActivationCountCondition,
            targetAction: nextEdge.targetAction,
            style: null,
            hidden: false,
            zIndex: 0,
            frontendOpId,
          },
        } as Parameters<typeof createStateMachineEdge>[0]),
      ),
  });
}
export function toggleStateMachineEdgeSelection(
  edgeId: string,
  multiSelect: boolean,
): void {
  clearActiveSectionIds();
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      for (const edge of state.projectConfig.stateMachineEdges) {
        if (edge.id === edgeId) {
          edge.selected = multiSelect ? !edge.selected : true;
        } else if (!multiSelect) {
          edge.selected = false;
        }
      }
    },
    send: (frontendOpId) => {
      if (multiSelect) {
        const edge = useProjectState
          .getState()
          .projectConfig.stateMachineEdges.find(
            (candidate) => candidate.id === edgeId,
          );
        if (!edge) {
          return;
        }
        return callOpenAPI(
          updateStateMachineEdge({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              edge,
              frontendOpId,
            },
          } as Parameters<typeof updateStateMachineEdge>[0]),
        );
      }
      return callOpenAPI(
        setStateMachineEdges({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            edges: useProjectState.getState().projectConfig.stateMachineEdges,
            frontendOpId,
          },
        } as Parameters<typeof setStateMachineEdges>[0]),
      );
    },
  });
}
export function deleteSelectedStateMachineEdges(): boolean {
  if (useShareSession.getState().isDeploymentMode) {
    return false;
  }
  const selectedIds = useProjectState
    .getState()
    .projectConfig.stateMachineEdges.filter((edge) => edge.selected)
    .map((edge) => edge.id);
  if (selectedIds.length === 0) {
    return false;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      draft.projectConfig.stateMachineEdges =
        draft.projectConfig.stateMachineEdges.filter(
          (edge) => !selectedIds.includes(edge.id),
        );
    },
    send: (frontendOpId) =>
      callOpenAPI(
        deleteStateMachineEdges({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            edgeIds: selectedIds,
            frontendOpId,
          },
        } as Parameters<typeof deleteStateMachineEdges>[0]),
      ),
  });
  return true;
}
export function replaceStateMachineEdge(
  nextEdge: WorkflowEdge,
): Promise<WorkflowEdgeMutationResponse> | undefined {
  if (useShareSession.getState().isDeploymentMode) {
    return undefined;
  }
  const { result } = dispatchOptimisticProjectStateUpdateWithResult({
    apply: (state) => {
      const index = state.projectConfig.stateMachineEdges.findIndex(
        (edge) => edge.id === nextEdge.id,
      );
      if (index === -1) {
        return;
      }
      state.projectConfig.stateMachineEdges[index] = nextEdge;
    },
    send: (frontendOpId) =>
      callOpenAPI(
        updateStateMachineEdge({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            edge: nextEdge,
            frontendOpId,
          },
        } as Parameters<typeof updateStateMachineEdge>[0]),
      ),
  });
  return result;
}
