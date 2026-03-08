import type { Connection } from "forks/xyflow/core/types";
import { useLocalStorage } from "state/definitions";
import {
  createAgenticEdgeFromConnection,
  isValidAgenticEdgeConnection,
  normalizeAgenticConnectionHandles,
} from "./agenticEdges";
import type { ChatSharedEdgeMode } from "./chatSharedHandleIds";
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
  const normalizedAgenticConnection =
    normalizeAgenticConnectionHandles(connection);
  const normalizedWorkflowConnection =
    normalizeWorkflowConnectionHandles(connection);
  const canCreateAgenticEdge = isValidAgenticEdgeConnection(connection);
  const canCreateWorkflowEdge = isValidStateMachineEdgeConnection(connection);
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
    return;
  }
  if (resolvedConnection.family === "workflow") {
    createStateMachineEdgeFromConnection(resolvedConnection.connection);
    return;
  }
  createAgenticEdgeFromConnection(resolvedConnection.connection);
}
