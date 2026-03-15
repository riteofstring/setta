import type { Connection } from "forks/xyflow/core/types";
import { isSharedChatHandleId } from "./chatSharedHandleIds";

export const STATE_MACHINE_EDGE_HANDLE_IDS = {
  source: "workflow-source",
  target: "workflow-target",
  reverseStart: "workflow-reverse-start",
} as const;

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

export function hasWorkflowHandles(connection: Connection): boolean {
  const normalizedConnection = normalizeWorkflowConnectionHandles(connection);
  return (
    normalizedConnection.sourceHandle ===
      STATE_MACHINE_EDGE_HANDLE_IDS.source &&
    normalizedConnection.targetHandle === STATE_MACHINE_EDGE_HANDLE_IDS.target
  );
}

export function usesSharedChatHandleOnNormalizedSource(
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

export function usesSharedChatHandleOnNormalizedTarget(
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
