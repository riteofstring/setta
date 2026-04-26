import type { Connection } from "forks/xyflow/core/types";

type WorkflowDebugPayload = Record<string, unknown> | null | undefined;

declare global {
  interface Window {
    __SETTA_WORKFLOW_DEBUG__?: boolean;
  }
}

function isWorkflowDebugEnabled(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }
  if (typeof window === "undefined") {
    return true;
  }
  return window.__SETTA_WORKFLOW_DEBUG__ !== false;
}

export function logWorkflowDebug(
  message: string,
  payload?: WorkflowDebugPayload,
): void {
  if (!isWorkflowDebugEnabled()) {
    return;
  }
  if (payload === undefined) {
    console.debug(`[workflow] ${message}`);
    return;
  }
  console.debug(`[workflow] ${message}`, payload);
}

export function getConnectionDebugPayload(
  connection: Connection,
): Record<string, unknown> {
  return {
    source: connection.source ?? null,
    sourceHandle: connection.sourceHandle ?? null,
    target: connection.target ?? null,
    targetHandle: connection.targetHandle ?? null,
  };
}
