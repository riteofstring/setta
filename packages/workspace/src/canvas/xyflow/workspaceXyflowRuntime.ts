import { registerWorkspaceHostCleanup } from "../../workspaceHostInternals";
import type { WorkspaceHost } from "../../workspaceHost";
import { assertWorkspaceHostActive } from "../../workspaceHostInternals";
import type {
  WorkspaceXyflowInstance,
  WorkspaceXyflowPosition,
  WorkspaceXyflowViewport,
} from "./types";

type WorkspaceXyflowRuntime = {
  getInstance(): WorkspaceXyflowInstance | null;
  getViewport(): WorkspaceXyflowViewport | null;
  screenToFlowPosition(
    position: WorkspaceXyflowPosition,
  ): WorkspaceXyflowPosition | null;
  setViewport(viewport: WorkspaceXyflowViewport): Promise<boolean>;
};

type WorkspaceXyflowRuntimeState = {
  instance: WorkspaceXyflowInstance | null;
  runtime: WorkspaceXyflowRuntime;
};

const runtimesByHost = new WeakMap<
  WorkspaceHost,
  WorkspaceXyflowRuntimeState
>();

function createWorkspaceXyflowRuntimeState(): WorkspaceXyflowRuntimeState {
  const state: WorkspaceXyflowRuntimeState = {
    instance: null,
    runtime: {
      getInstance: () => state.instance,
      getViewport: () => state.instance?.getViewport() ?? null,
      screenToFlowPosition: (position) =>
        state.instance?.screenToFlowPosition(position) ?? null,
      setViewport: (viewport) =>
        state.instance?.setViewport(viewport) ?? Promise.resolve(false),
    },
  };
  return state;
}

function getWorkspaceXyflowRuntimeState(
  host: WorkspaceHost,
): WorkspaceXyflowRuntimeState {
  assertWorkspaceHostActive(host);
  const existing = runtimesByHost.get(host);
  if (existing) {
    return existing;
  }
  const state = createWorkspaceXyflowRuntimeState();
  runtimesByHost.set(host, state);
  registerWorkspaceHostCleanup(host, () => {
    state.instance = null;
    runtimesByHost.delete(host);
  });
  return state;
}

export function getWorkspaceXyflowRuntime(
  host: WorkspaceHost,
): WorkspaceXyflowRuntime {
  return getWorkspaceXyflowRuntimeState(host).runtime;
}

export function registerWorkspaceXyflowInstance(
  host: WorkspaceHost,
  instance: WorkspaceXyflowInstance,
): () => void {
  const state = getWorkspaceXyflowRuntimeState(host);
  state.instance = instance;
  return () => {
    if (state.instance === instance) {
      state.instance = null;
    }
  };
}
