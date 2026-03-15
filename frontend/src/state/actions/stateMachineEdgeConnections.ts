import type { Connection } from "forks/xyflow/core/types";
import { useProjectState, useShareSession } from "state/definitions";
import {
  SectionTypeEnum,
  type ProjectStateSingleConfig,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import {
  hasWorkflowHandles,
  normalizeWorkflowConnectionHandles,
  STATE_MACHINE_EDGE_HANDLE_IDS,
  usesSharedChatHandleOnNormalizedSource,
  usesSharedChatHandleOnNormalizedTarget,
} from "./stateMachineEdgeCanonicalization";
import {
  getWorkflowSectionInfo,
  isAllowedStateMachineConnection,
  resolveMachineGroupTransitionForConnection,
} from "./stateMachineEdgeGraph";

type WorkflowEdge =
  ProjectStateSingleConfig["projectConfig"]["stateMachineEdges"][number];
type WorkflowSourceFilter = NonNullable<WorkflowEdge["sourceFilter"]>;
type WorkflowTargetAction = NonNullable<WorkflowEdge["targetAction"]>;

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
