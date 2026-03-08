import type { Connection } from "forks/xyflow/core/types";
import { useLocalStorage } from "state/definitions";
import {
  createAgenticEdgeFromConnection,
  isValidAgenticEdgeConnection,
  normalizeAgenticConnectionHandles,
} from "./agenticEdges";
import {
  SHARED_CHAT_EDGE_HANDLE_IDS,
  type ChatSharedEdgeMode,
} from "./chatSharedHandleIds";
import {
  getConnectionDebugPayload,
  logWorkflowDebug,
} from "./stateMachineDebug";
import {
  createStateMachineEdgeFromConnection,
  isValidStateMachineEdgeConnection,
  normalizeWorkflowConnectionHandles,
} from "./stateMachineEdges";

type SharedChatConnectionResolution = {
  family: ChatSharedEdgeMode;
  connection: Connection;
};

export function getChatSharedEdgeModeLabel(mode: ChatSharedEdgeMode): string {
  return mode === "workflow" ? "Workflow" : "Agentic";
}

function resolveSharedChatConnection(
  connection: Connection,
): SharedChatConnectionResolution | null {
  const normalizedSharedConnection = normalizeSharedChatConnection(connection);
  const normalizedAgenticConnection = normalizeAgenticConnectionHandles(
    normalizedSharedConnection,
  );
  const normalizedWorkflowConnection = normalizeWorkflowConnectionHandles(
    normalizedSharedConnection,
  );
  const canCreateAgenticEdge = isValidAgenticEdgeConnection(
    normalizedSharedConnection,
  );
  const canCreateWorkflowEdge = isValidStateMachineEdgeConnection(
    normalizedSharedConnection,
  );
  if (canCreateAgenticEdge && canCreateWorkflowEdge) {
    const preferredMode = useLocalStorage.getState().chatSharedEdgeMode;
    return preferredMode === "workflow"
      ? {
          family: "workflow",
          connection: normalizedWorkflowConnection,
        }
      : {
          family: "agentic",
          connection: normalizedAgenticConnection,
        };
  }
  if (canCreateWorkflowEdge) {
    return {
      family: "workflow",
      connection: normalizedWorkflowConnection,
    };
  }
  if (canCreateAgenticEdge) {
    return {
      family: "agentic",
      connection: normalizedAgenticConnection,
    };
  }
  return null;
}

function normalizeSharedChatConnection(connection: Connection): Connection {
  if (connection.targetHandle === SHARED_CHAT_EDGE_HANDLE_IDS.reverseStart) {
    return {
      ...connection,
      targetHandle: SHARED_CHAT_EDGE_HANDLE_IDS.target,
    };
  }
  if (connection.sourceHandle !== SHARED_CHAT_EDGE_HANDLE_IDS.reverseStart) {
    return connection;
  }
  return {
    source: connection.target,
    sourceHandle: connection.targetHandle,
    target: connection.source,
    targetHandle: SHARED_CHAT_EDGE_HANDLE_IDS.target,
  };
}

export function isValidSharedChatEdgeConnection(
  connection: Connection,
): boolean {
  return resolveSharedChatConnection(connection) !== null;
}

export function createSharedChatEdgeFromConnection(
  connection: Connection,
): void {
  const resolvedConnection = resolveSharedChatConnection(connection);
  if (!resolvedConnection) {
    logWorkflowDebug("shared chat connection rejected", {
      ...getConnectionDebugPayload(connection),
      agenticValid: isValidAgenticEdgeConnection(connection),
      workflowValid: isValidStateMachineEdgeConnection(connection),
      preferredMode: useLocalStorage.getState().chatSharedEdgeMode,
    });
    return;
  }
  logWorkflowDebug("shared chat connection resolved", {
    ...getConnectionDebugPayload(connection),
    family: resolvedConnection.family,
    resolvedConnection: getConnectionDebugPayload(
      resolvedConnection.connection,
    ),
    preferredMode: useLocalStorage.getState().chatSharedEdgeMode,
  });
  if (resolvedConnection.family === "workflow") {
    createStateMachineEdgeFromConnection(resolvedConnection.connection);
    return;
  }
  createAgenticEdgeFromConnection(resolvedConnection.connection);
}
