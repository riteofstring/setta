import { createWithEqualityFn } from "zustand/traditional";
import type {
  WorkspaceItemCommandContext,
  WorkspacePaneCommandContext,
  WorkspaceSectionCommandContext,
} from "../commands/workspaceCommandTypes";
import type { Position } from "../document/types";
import { withResetFn } from "../state/storeUtils";
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

export const useWorkspaceMenuState = createWithEqualityFn(
  withResetFn<WorkspaceMenuState>(() => ({ invocation: null })),
);

let nextWorkspaceMenuSequence = 1;

export function publishWorkspaceMenuInvocation(
  invocation: WorkspaceMenuInvocationInput,
): void {
  useWorkspaceMenuState.setState({
    invocation: {
      ...invocation,
      sequence: nextWorkspaceMenuSequence,
    } as WorkspaceMenuInvocation,
  });
  nextWorkspaceMenuSequence += 1;
}

export function closeWorkspaceMenu(restoreFocus = true): void {
  const invocation = useWorkspaceMenuState.getState().invocation;
  if (!invocation) {
    return;
  }
  useWorkspaceMenuState.setState({ invocation: null });
  if (restoreFocus && invocation.owner.isConnected) {
    invocation.owner.focus({ preventScroll: true });
  }
}
