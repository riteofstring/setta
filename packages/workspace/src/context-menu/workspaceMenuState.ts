import { createStore } from "zustand/vanilla";
import type {
  WorkspaceItemCommandContext,
  WorkspacePaneCommandContext,
  WorkspaceSectionCommandContext,
} from "../commands/workspaceCommandTypes";
import type { Position } from "../document/types";
import { withResetFn } from "../state/storeUtils";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import type { WorkspaceTextDirection } from "../styles/textDirection";
import type { WorkspaceMenuClientPoint } from "./workspaceMenuGeometry";

type WorkspaceMenuInvocationBase = {
  clientPoint: WorkspaceMenuClientPoint;
  direction: WorkspaceTextDirection;
  owner: HTMLElement;
  sequence: number;
};

export type WorkspaceMenuInitialFocus = "first" | "last";

// The section menu opens on three command surfaces; the invocation records which one so the
// command registry offers exactly that surface's set.
export type WorkspaceSectionMenuSurface = "context-menu" | "header" | "outline";

export type WorkspaceMenuInvocation =
  // A pane menu always opens at a point, so it keeps that point beside the command context it
  // hands to actions: a command reports no position when its surface has no pointer, and the
  // menu's own creation entries still create exactly where they were asked to.
  | (WorkspaceMenuInvocationBase & {
      kind: "pane";
      context: WorkspacePaneCommandContext;
      workspacePosition: Position;
    })
  | (WorkspaceMenuInvocationBase & {
      kind: "section";
      context: WorkspaceSectionCommandContext;
      initialFocus: WorkspaceMenuInitialFocus;
      surface: WorkspaceSectionMenuSurface;
    })
  | (WorkspaceMenuInvocationBase & {
      kind: "item";
      context: WorkspaceItemCommandContext;
    });

type WorkspaceMenuInvocationInput =
  WorkspaceMenuInvocation extends infer Invocation
    ? Invocation extends WorkspaceMenuInvocation
      ? Omit<Invocation, "sequence">
      : never
    : never;

type WorkspaceMenuState = {
  invocation: WorkspaceMenuInvocation | null;
};

type WorkspaceMenuStoreState = {
  nextSequence: number;
  store: ReturnType<typeof createWorkspaceMenuStateStore>;
};

function createWorkspaceMenuStateStore() {
  return createStore(
    withResetFn<WorkspaceMenuState>(() => ({ invocation: null })),
  );
}

const storesByHost = new WeakMap<WorkspaceHost, WorkspaceMenuStoreState>();

function getWorkspaceMenuStoreState(
  host: WorkspaceHost,
): WorkspaceMenuStoreState {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const state = { nextSequence: 1, store: createWorkspaceMenuStateStore() };
  storesByHost.set(host, state);
  return state;
}

export function getWorkspaceMenuStateStore(host: WorkspaceHost) {
  return getWorkspaceMenuStoreState(host).store;
}

export function useWorkspaceMenuState<T>(
  selector: (state: WorkspaceMenuState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getWorkspaceMenuStateStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

export function publishWorkspaceMenuInvocation(
  host: WorkspaceHost,
  invocation: WorkspaceMenuInvocationInput,
): void {
  const state = getWorkspaceMenuStoreState(host);
  state.store.setState({
    invocation: {
      ...invocation,
      sequence: state.nextSequence,
    } as WorkspaceMenuInvocation,
  });
  state.nextSequence += 1;
}

export function closeWorkspaceMenu(
  host: WorkspaceHost,
  restoreFocus = true,
): void {
  const invocation = getWorkspaceMenuStateStore(host).getState().invocation;
  if (!invocation) {
    return;
  }
  getWorkspaceMenuStateStore(host).setState({ invocation: null });
  if (restoreFocus && invocation.owner.isConnected) {
    invocation.owner.focus({ preventScroll: true });
  }
}
