export interface WorkflowGraphRuntimeHandle {
  setFrozen(frozen: boolean): void;
}

interface WorkflowGraphRuntimeApi {
  __handles: Map<string, WorkflowGraphRuntimeHandle>;
  getHandle(surfaceId: string): WorkflowGraphRuntimeHandle | null;
}

export function registerWorkflowGraphRuntimeHandle(
  surfaceId: string,
  handle: WorkflowGraphRuntimeHandle,
): () => void {
  const api = ensureWorkflowGraphRuntimeApi();
  api.__handles.set(surfaceId, handle);
  return () => {
    if (api.__handles.get(surfaceId) === handle) {
      api.__handles.delete(surfaceId);
    }
    if (api.__handles.size === 0 && window.__settaWorkflowGraphRuntime === api) {
      delete window.__settaWorkflowGraphRuntime;
    }
  };
}

export function workflowGraphRuntimeHandle(surfaceId: string): WorkflowGraphRuntimeHandle | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.__settaWorkflowGraphRuntime?.getHandle(surfaceId) ?? null;
}

function ensureWorkflowGraphRuntimeApi(): WorkflowGraphRuntimeApi {
  const existing = window.__settaWorkflowGraphRuntime;
  if (existing?.__handles instanceof Map) {
    return existing;
  }
  const handles = new Map<string, WorkflowGraphRuntimeHandle>();
  const api: WorkflowGraphRuntimeApi = {
    __handles: handles,
    getHandle(surfaceId) {
      return handles.get(surfaceId) ?? null;
    },
  };
  window.__settaWorkflowGraphRuntime = api;
  return api;
}
