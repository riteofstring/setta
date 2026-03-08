import type { Connection } from "forks/xyflow/core/types";
import { addTemporaryNotification } from "state/actions/notifications";
import { useProjectState, useShareSession } from "state/definitions";
import {
  route_create_state_machine_edge,
  route_delete_state_machine_edges,
  route_set_state_machine_edges,
  route_update_state_machine_edge,
} from "utils/generatedEndpoints";
import {
  SectionTypeEnum,
  type ProjectStateSingleConfig,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { clearActiveSectionIds } from "./activeSections";
import { isSharedChatHandleId } from "./chatSharedHandleIds";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
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

type WorkflowEdge =
  ProjectStateSingleConfig["projectConfig"]["stateMachineEdges"][number];
type WorkflowSourceFilter = NonNullable<WorkflowEdge["sourceFilter"]>;
type WorkflowTargetAction = NonNullable<WorkflowEdge["targetAction"]>;

type WorkflowSectionInfo = {
  type: SectionTypeEnum | null;
  machineGroupId: string | null;
};

function getWorkflowSectionInfo(
  state: ProjectStateSingleConfig,
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
  state: ProjectStateSingleConfig,
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

function resolveMachineGroupIdForConnection(
  connection: Connection,
  state: ProjectStateSingleConfig,
): string | null {
  if (!connection.source || !connection.target) {
    return null;
  }
  const sourceInfo = getWorkflowSectionInfo(state, connection.source);
  const targetInfo = getWorkflowSectionInfo(state, connection.target);
  const machineGroupIds = new Set<string>();
  if (sourceInfo.machineGroupId) {
    machineGroupIds.add(sourceInfo.machineGroupId);
  }
  if (targetInfo.machineGroupId) {
    machineGroupIds.add(targetInfo.machineGroupId);
  }
  if (machineGroupIds.size === 0) {
    const sourceConnectedGroup = getUniqueConnectedMachineGroupId(
      state,
      connection.source,
    );
    if (sourceConnectedGroup) {
      machineGroupIds.add(sourceConnectedGroup);
    }
    const targetConnectedGroup = getUniqueConnectedMachineGroupId(
      state,
      connection.target,
    );
    if (targetConnectedGroup) {
      machineGroupIds.add(targetConnectedGroup);
    }
  }
  if (machineGroupIds.size !== 1) {
    return null;
  }
  const [machineGroupId] = machineGroupIds;
  return machineGroupId ?? null;
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
  const sourceAllowed = new Set<SectionTypeEnum>([
    SectionTypeEnum.Chat,
    SectionTypeEnum.StateMachineStart,
    SectionTypeEnum.StateMachineGate,
  ]);
  const targetAllowed = new Set<SectionTypeEnum>([
    SectionTypeEnum.Chat,
    SectionTypeEnum.StateMachineGate,
    SectionTypeEnum.StateMachineEnd,
  ]);
  if (!sourceAllowed.has(sourceType) || !targetAllowed.has(targetType)) {
    return false;
  }
  if (sourceType === SectionTypeEnum.StateMachineEnd) {
    return false;
  }
  if (targetType === SectionTypeEnum.StateMachineStart) {
    return false;
  }
  if (
    sourceSectionId === targetSectionId &&
    sourceType !== SectionTypeEnum.Chat
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
    inlinePrompt: null,
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
  state: ProjectStateSingleConfig,
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
  const machineGroupId = resolveMachineGroupIdForConnection(
    normalizedConnection,
    state,
  );
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
    resolveMachineGroupIdForConnection(normalizedConnection, state) !== null
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
  const nextEdge = buildStateMachineEdgeForConnection(connection, state);
  if (!nextEdge) {
    logWorkflowDebug("workflow edge creation rejected", {
      ...getConnectionDebugPayload(connection),
      normalizedConnection: getConnectionDebugPayload(
        normalizeWorkflowConnectionHandles(connection),
      ),
      sourceInfo: connection.source
        ? getWorkflowSectionInfo(state, connection.source)
        : null,
      targetInfo: connection.target
        ? getWorkflowSectionInfo(state, connection.target)
        : null,
      resolvedMachineGroupId: resolveMachineGroupIdForConnection(
        normalizeWorkflowConnectionHandles(connection),
        state,
      ),
    });
    addTemporaryNotification(
      "Workflow edges require compatible workflow ports and one resolvable machine group.",
      "warning",
    );
    return;
  }
  logWorkflowDebug("workflow edge created", {
    edgeId: nextEdge.id,
    machineGroupId: nextEdge.machineGroupId,
    sourceSectionId: nextEdge.sourceSectionId,
    sourcePortId: nextEdge.sourcePortId,
    targetSectionId: nextEdge.targetSectionId,
    targetPortId: nextEdge.targetPortId,
    sourceFilterType: nextEdge.sourceFilter?.type ?? null,
    targetActionType: nextEdge.targetAction?.type ?? null,
  });
  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
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
    },
    send: (frontendOpId) =>
      route_create_state_machine_edge({
        projectConfigId: getCurrProjectConfigId(),
        id: nextEdge.id,
        machineGroupId: nextEdge.machineGroupId,
        sourceSectionId: nextEdge.sourceSectionId,
        sourcePortId: nextEdge.sourcePortId,
        targetSectionId: nextEdge.targetSectionId,
        targetPortId: nextEdge.targetPortId,
        sourceFilter: nextEdge.sourceFilter,
        targetAction: nextEdge.targetAction,
        style: null,
        hidden: false,
        zIndex: 0,
        frontendOpId,
      }),
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
        return route_update_state_machine_edge({
          projectConfigId: getCurrProjectConfigId(),
          edge,
          frontendOpId,
        });
      }
      return route_set_state_machine_edges({
        projectConfigId: getCurrProjectConfigId(),
        edges: useProjectState.getState().projectConfig.stateMachineEdges,
        frontendOpId,
      });
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
      route_delete_state_machine_edges({
        projectConfigId: getCurrProjectConfigId(),
        edgeIds: selectedIds,
        frontendOpId,
      }),
  });
  return true;
}

export function replaceStateMachineEdge(nextEdge: WorkflowEdge): void {
  if (useShareSession.getState().isDeploymentMode) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
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
      route_update_state_machine_edge({
        projectConfigId: getCurrProjectConfigId(),
        edge: nextEdge,
        frontendOpId,
      }),
  });
}
