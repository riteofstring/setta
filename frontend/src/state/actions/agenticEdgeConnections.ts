import type { Connection } from "forks/xyflow/core/types";
import { useProjectState, useShareSession } from "state/definitions";
import { AgenticEdgeKindEnum, SectionTypeEnum } from "utils/generatedTypes";
import { isSharedChatHandleId } from "./chatSharedHandleIds";
import { isWorkflowHandleId } from "./stateMachineEdgeCanonicalization";

export const AGENTIC_EDGE_HANDLE_IDS = {
  source: "agentic-edge-source",
  target: "agentic-edge-target",
  reverseStart: "agentic-edge-reverse-start",
} as const;

export function normalizeAgenticConnectionHandles(
  connection: Connection,
): Connection {
  const normalizedReverseConnection =
    normalizeReverseStartedAgenticConnection(connection);
  return {
    ...normalizedReverseConnection,
    sourceHandle: isSharedChatHandleId(normalizedReverseConnection.sourceHandle)
      ? AGENTIC_EDGE_HANDLE_IDS.source
      : normalizedReverseConnection.sourceHandle,
    targetHandle:
      normalizedReverseConnection.targetHandle ===
      AGENTIC_EDGE_HANDLE_IDS.reverseStart
        ? AGENTIC_EDGE_HANDLE_IDS.target
        : isSharedChatHandleId(normalizedReverseConnection.targetHandle)
          ? AGENTIC_EDGE_HANDLE_IDS.target
          : normalizedReverseConnection.targetHandle,
  };
}

export function resolveAgenticEdgeKind(
  sourceType: SectionTypeEnum,
  targetType: SectionTypeEnum,
): AgenticEdgeKindEnum | null {
  if (
    sourceType === SectionTypeEnum.StateMachineStart ||
    sourceType === SectionTypeEnum.StateMachineGate ||
    sourceType === SectionTypeEnum.StateMachineEnd ||
    targetType === SectionTypeEnum.StateMachineStart ||
    targetType === SectionTypeEnum.StateMachineGate ||
    targetType === SectionTypeEnum.StateMachineEnd
  ) {
    return null;
  }
  if (
    sourceType === SectionTypeEnum.Chat &&
    targetType === SectionTypeEnum.Chat
  ) {
    return AgenticEdgeKindEnum.chat_chat;
  }
  if (sourceType === SectionTypeEnum.Chat) {
    return AgenticEdgeKindEnum.chat_section;
  }
  if (targetType === SectionTypeEnum.Chat) {
    return AgenticEdgeKindEnum.section_chat;
  }
  return null;
}

export function resolveAgenticKindForConnection(
  connection: Connection,
  state?: ReturnType<typeof useProjectState.getState>,
): AgenticEdgeKindEnum | null {
  const types = getConnectionSectionTypes(connection, state);
  if (!types || !types.sourceType || !types.targetType) {
    return null;
  }
  return resolveAgenticEdgeKind(types.sourceType, types.targetType);
}

export function resolveAgenticKindForSectionIds(
  sourceSectionId: string,
  targetSectionId: string,
  state: ReturnType<
    typeof useProjectState.getState
  > = useProjectState.getState(),
): AgenticEdgeKindEnum | null {
  const sourceType = getSectionTypeById(state, sourceSectionId);
  const targetType = getSectionTypeById(state, targetSectionId);
  if (!sourceType || !targetType) {
    return null;
  }
  return resolveAgenticEdgeKind(sourceType, targetType);
}

export function isValidAgenticEdgeConnection(connection: Connection): boolean {
  const normalizedConnection = normalizeAgenticConnectionHandles(connection);
  if (!normalizedConnection.source || !normalizedConnection.target) {
    return false;
  }
  if (
    isWorkflowHandleId(normalizedConnection.sourceHandle) ||
    isWorkflowHandleId(normalizedConnection.targetHandle)
  ) {
    return false;
  }
  if (normalizedConnection.source === normalizedConnection.target) {
    return false;
  }
  if (useShareSession.getState().isDeploymentMode) {
    return false;
  }
  const types = getConnectionSectionTypes(normalizedConnection);
  if (!types || !types.sourceType || !types.targetType) {
    return true;
  }
  if (
    usesSharedChatHandleOnNormalizedSource(connection, normalizedConnection) &&
    types.sourceType !== SectionTypeEnum.Chat
  ) {
    return false;
  }
  if (
    usesSharedChatHandleOnNormalizedTarget(connection, normalizedConnection) &&
    types.targetType !== SectionTypeEnum.Chat
  ) {
    return false;
  }
  return resolveAgenticEdgeKind(types.sourceType, types.targetType) !== null;
}

function getSectionTypeById(
  state: ReturnType<typeof useProjectState.getState>,
  sectionId: string,
): SectionTypeEnum | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  return impl.type ?? null;
}

function normalizeReverseStartedAgenticConnection(
  connection: Connection,
): Connection {
  if (connection.sourceHandle !== AGENTIC_EDGE_HANDLE_IDS.reverseStart) {
    return connection;
  }
  return {
    source: connection.target,
    sourceHandle: connection.targetHandle,
    target: connection.source,
    targetHandle: AGENTIC_EDGE_HANDLE_IDS.target,
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

function getConnectionSectionTypes(
  connection: Connection,
  state: ReturnType<
    typeof useProjectState.getState
  > = useProjectState.getState(),
): {
  sourceType: SectionTypeEnum | null;
  targetType: SectionTypeEnum | null;
} | null {
  if (!connection.source || !connection.target) {
    return null;
  }
  return {
    sourceType: getSectionTypeById(state, connection.source),
    targetType: getSectionTypeById(state, connection.target),
  };
}
