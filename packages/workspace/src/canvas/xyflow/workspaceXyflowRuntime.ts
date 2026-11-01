import { registerWorkspaceHostCleanup } from "../../workspaceHostInternals.js";
import type { WorkspaceHost } from "../../workspaceHost.js";
import { assertWorkspaceHostActive } from "../../workspaceHostInternals.js";
import type { ViewportHelperFunctionOptions } from "@xyflow/react";
import type {
  WorkspaceXyflowInstance,
  WorkspaceXyflowPosition,
  WorkspaceXyflowViewport,
} from "./types.js";

type WorkspaceXyflowRuntime = {
  getInstance(): WorkspaceXyflowInstance | null;
  getViewport(): WorkspaceXyflowViewport | null;
  screenToFlowPosition(
    position: WorkspaceXyflowPosition,
  ): WorkspaceXyflowPosition | null;
  setViewport(
    viewport: WorkspaceXyflowViewport,
    options?: ViewportHelperFunctionOptions,
  ): Promise<boolean>;
  zoomTo(
    zoom: number,
    options?: ViewportHelperFunctionOptions,
  ): Promise<boolean>;
};

type WorkspaceXyflowRuntimeState = {
  instance: WorkspaceXyflowInstance | null;
  listeners: Set<() => void>;
  runtime: WorkspaceXyflowRuntime;
};

const runtimesByHost = new WeakMap<
  WorkspaceHost,
  WorkspaceXyflowRuntimeState
>();

function createWorkspaceXyflowRuntimeState(): WorkspaceXyflowRuntimeState {
  const state: WorkspaceXyflowRuntimeState = {
    instance: null,
    listeners: new Set(),
    runtime: {
      getInstance: () => state.instance,
      getViewport: () => state.instance?.getViewport() ?? null,
      screenToFlowPosition: (position) =>
        state.instance?.screenToFlowPosition(position) ?? null,
      setViewport: (viewport, options) => {
        if (!state.instance) {
          return Promise.resolve(false);
        }
        return options === undefined
          ? state.instance.setViewport(viewport)
          : state.instance.setViewport(viewport, options);
      },
      zoomTo: (zoom, options) => {
        if (!state.instance) {
          return Promise.resolve(false);
        }
        return options === undefined
          ? state.instance.zoomTo(zoom)
          : state.instance.zoomTo(zoom, options);
      },
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
    state.listeners.clear();
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
  for (const listener of state.listeners) listener();
  return () => {
    if (state.instance === instance) {
      state.instance = null;
      for (const listener of state.listeners) listener();
    }
  };
}

export function subscribeWorkspaceXyflowRuntime(
  host: WorkspaceHost,
  listener: () => void,
): () => void {
  const state = getWorkspaceXyflowRuntimeState(host);
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}
