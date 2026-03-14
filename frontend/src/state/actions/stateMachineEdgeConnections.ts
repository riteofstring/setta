import type { Connection } from "forks/xyflow/core/types";
import { useProjectState, useShareSession } from "state/definitions";
import {
  SectionTypeEnum,
  type ProjectStateSingleConfig,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { isSharedChatHandleId } from "./chatSharedHandleIds";
import { setCurrEffectiveSectionImplValue } from "./sectionEffectiveImplMutations";
import { getCurrEffectiveSectionImpl } from "./sectionEffectiveImpls";

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

type WorkflowMachineGroupTransition = {
  machineGroupId: string | null;
  mergedMachineGroupIds: string[];
};

type WorkflowMachineGroupMergeSnapshot = {
  edgeMachineGroupById: Record<string, string>;
  sectionMachineGroupById: Record<string, string>;
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

function resolveExistingMachineGroupIdForConnectionEndpoint(
  state: ProjectStateSingleConfig,
  sectionId: string,
  sectionInfo: WorkflowSectionInfo,
): string | null {
  if (sectionInfo.machineGroupId) {
    return sectionInfo.machineGroupId;
  }
  return getUniqueConnectedMachineGroupId(state, sectionId);
}

export function resolveMachineGroupTransitionForConnection(
  connection: Connection,
  state: ProjectStateSingleConfig,
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

export function captureWorkflowMachineGroupMergeSnapshot(
  state: ProjectStateSingleConfig,
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
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (
      (impl.type === SectionTypeEnum.StateMachineStart ||
        impl.type === SectionTypeEnum.StateMachineGate ||
        impl.type === SectionTypeEnum.StateMachineEnd) &&
      mergedMachineGroupIdSet.has(impl.machineGroupId)
    ) {
      sectionMachineGroupById[sectionId] = impl.machineGroupId;
    }
  }
  return {
    edgeMachineGroupById,
    sectionMachineGroupById,
  };
}

export function applyWorkflowMachineGroupMerge(
  state: ProjectStateSingleConfig,
  machineGroupId: string,
  mergedMachineGroupIds: string[],
): void {
  if (mergedMachineGroupIds.length === 0) {
    return;
  }
  const mergedMachineGroupIdSet = new Set(mergedMachineGroupIds);
  for (const sectionId of Object.keys(state.projectConfig.sectionVariantMap)) {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (
      impl.type === SectionTypeEnum.StateMachineStart &&
      mergedMachineGroupIdSet.has(impl.machineGroupId)
    ) {
      setCurrEffectiveSectionImplValue<"StateMachineStartSection">(
        state,
        sectionId,
        { machineGroupId },
      );
      continue;
    }
    if (
      impl.type === SectionTypeEnum.StateMachineGate &&
      mergedMachineGroupIdSet.has(impl.machineGroupId)
    ) {
      setCurrEffectiveSectionImplValue<"StateMachineGateSection">(
        state,
        sectionId,
        { machineGroupId },
      );
      continue;
    }
    if (
      impl.type === SectionTypeEnum.StateMachineEnd &&
      mergedMachineGroupIdSet.has(impl.machineGroupId)
    ) {
      setCurrEffectiveSectionImplValue<"StateMachineEndSection">(
        state,
        sectionId,
        { machineGroupId },
      );
    }
  }
  for (const edge of state.projectConfig.stateMachineEdges) {
    if (mergedMachineGroupIdSet.has(edge.machineGroupId)) {
      edge.machineGroupId = machineGroupId;
    }
  }
}

export function restoreWorkflowMachineGroupMergeSnapshot(
  state: ProjectStateSingleConfig,
  snapshot: WorkflowMachineGroupMergeSnapshot,
): void {
  for (const [sectionId, machineGroupId] of Object.entries(
    snapshot.sectionMachineGroupById,
  )) {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (impl.type === SectionTypeEnum.StateMachineStart) {
      setCurrEffectiveSectionImplValue<"StateMachineStartSection">(
        state,
        sectionId,
        { machineGroupId },
      );
      continue;
    }
    if (impl.type === SectionTypeEnum.StateMachineGate) {
      setCurrEffectiveSectionImplValue<"StateMachineGateSection">(
        state,
        sectionId,
        { machineGroupId },
      );
      continue;
    }
    if (impl.type === SectionTypeEnum.StateMachineEnd) {
      setCurrEffectiveSectionImplValue<"StateMachineEndSection">(
        state,
        sectionId,
        { machineGroupId },
      );
    }
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

export function buildStateMachineEdgeForConnection(
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
