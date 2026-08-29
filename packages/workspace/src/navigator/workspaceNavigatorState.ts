import { createStore, type StoreApi } from "zustand/vanilla";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import {
  assertWorkspaceHostActive,
  registerWorkspaceHostCleanup,
} from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import type {
  WorkspaceNavigatorMode,
  WorkspaceNavigatorState,
} from "./workspaceNavigatorTypes";

type WorkspaceNavigatorRuntime = {
  mountedSurfaceCount: number;
  store: StoreApi<WorkspaceNavigatorState>;
};

const runtimesByHost = new WeakMap<WorkspaceHost, WorkspaceNavigatorRuntime>();

function createWorkspaceNavigatorState(): WorkspaceNavigatorState {
  return {
    activeIndex: 0,
    isOpen: false,
    mode: "find",
    opener: null,
    query: "",
    statusMessage: null,
  };
}

function createWorkspaceNavigatorRuntime(): WorkspaceNavigatorRuntime {
  return {
    mountedSurfaceCount: 0,
    store: createStore<WorkspaceNavigatorState>(() =>
      createWorkspaceNavigatorState(),
    ),
  };
}

function getWorkspaceNavigatorRuntime(
  host: WorkspaceHost,
): WorkspaceNavigatorRuntime {
  assertWorkspaceHostActive(host);
  const existing = runtimesByHost.get(host);
  if (existing) {
    return existing;
  }
  const runtime = createWorkspaceNavigatorRuntime();
  runtimesByHost.set(host, runtime);
  registerWorkspaceHostCleanup(host, () => {
    runtimesByHost.delete(host);
  });
  return runtime;
}

function assertWorkspaceNavigatorMode(
  mode: unknown,
): asserts mode is WorkspaceNavigatorMode {
  if (mode !== "find" && mode !== "commands") {
    throw new Error(`Unknown workspace navigator mode ${String(mode)}.`);
  }
}

function captureWorkspaceNavigatorOpener(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}

function restoreWorkspaceNavigatorFocus(opener: HTMLElement | null): void {
  if (
    !opener ||
    !opener.isConnected ||
    opener.matches(":disabled") ||
    opener.closest("[hidden], [inert]")
  ) {
    return;
  }
  opener.focus({ preventScroll: true });
}

export function getWorkspaceNavigatorStore(
  host: WorkspaceHost,
): StoreApi<WorkspaceNavigatorState> {
  return getWorkspaceNavigatorRuntime(host).store;
}

export function openWorkspaceNavigator(
  host: WorkspaceHost,
  mode: WorkspaceNavigatorMode,
): void {
  assertWorkspaceNavigatorMode(mode);
  const store = getWorkspaceNavigatorStore(host);
  const state = store.getState();
  if (state.isOpen && state.mode === mode) {
    return;
  }
  store.setState({
    activeIndex: 0,
    isOpen: true,
    mode,
    opener: state.isOpen ? state.opener : captureWorkspaceNavigatorOpener(),
    query: "",
    statusMessage: null,
  });
}

function resetWorkspaceNavigatorRuntime(
  runtime: WorkspaceNavigatorRuntime,
): HTMLElement | null {
  const state = runtime.store.getState();
  if (!state.isOpen) {
    return null;
  }
  runtime.store.setState({
    ...createWorkspaceNavigatorState(),
    mode: state.mode,
  });
  return state.opener;
}

export function closeWorkspaceNavigator(host: WorkspaceHost): void {
  restoreWorkspaceNavigatorFocus(
    resetWorkspaceNavigatorRuntime(getWorkspaceNavigatorRuntime(host)),
  );
}

export function closeWorkspaceNavigatorAfterFocusTransfer(
  host: WorkspaceHost,
): void {
  resetWorkspaceNavigatorRuntime(getWorkspaceNavigatorRuntime(host));
}

export function registerWorkspaceNavigatorSurface(
  host: WorkspaceHost,
): () => void {
  const runtime = getWorkspaceNavigatorRuntime(host);
  runtime.mountedSurfaceCount += 1;
  let registered = true;
  return () => {
    if (!registered) {
      return;
    }
    registered = false;
    runtime.mountedSurfaceCount -= 1;
    if (runtime.mountedSurfaceCount === 0) {
      restoreWorkspaceNavigatorFocus(resetWorkspaceNavigatorRuntime(runtime));
    }
  };
}

export function hasWorkspaceNavigatorSurface(host: WorkspaceHost): boolean {
  return getWorkspaceNavigatorRuntime(host).mountedSurfaceCount > 0;
}

export function setWorkspaceNavigatorMode(
  host: WorkspaceHost,
  mode: WorkspaceNavigatorMode,
): void {
  assertWorkspaceNavigatorMode(mode);
  const store = getWorkspaceNavigatorStore(host);
  const state = store.getState();
  if (state.mode === mode) {
    return;
  }
  store.setState({
    activeIndex: 0,
    mode,
    query: "",
    statusMessage: null,
  });
}

export function setWorkspaceNavigatorQuery(
  host: WorkspaceHost,
  query: string,
): void {
  if (typeof query !== "string") {
    throw new Error("Workspace navigator query must be a string.");
  }
  getWorkspaceNavigatorStore(host).setState({
    activeIndex: 0,
    query,
    statusMessage: null,
  });
}

export function setWorkspaceNavigatorActiveIndex(
  host: WorkspaceHost,
  activeIndex: number,
): void {
  if (!Number.isSafeInteger(activeIndex) || activeIndex < 0) {
    throw new Error(
      "Workspace navigator active index must be a non-negative safe integer.",
    );
  }
  getWorkspaceNavigatorStore(host).setState({ activeIndex });
}

export function setWorkspaceNavigatorStatus(
  host: WorkspaceHost,
  statusMessage: string | null,
): void {
  if (statusMessage !== null && typeof statusMessage !== "string") {
    throw new Error("Workspace navigator status must be a string or null.");
  }
  getWorkspaceNavigatorStore(host).setState({ statusMessage });
}

export function useWorkspaceNavigator<T>(
  selector: (state: WorkspaceNavigatorState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getWorkspaceNavigatorStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}
