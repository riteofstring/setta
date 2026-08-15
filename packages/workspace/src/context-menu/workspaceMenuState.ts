import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";
import type { WorkspaceTextDirection } from "../styles/textDirection";
import type { WorkspaceMenuClientPoint } from "./workspaceMenuGeometry";
import type {
  WorkspaceItemMenuActionContext,
  WorkspaceOutlineMenuActionContext,
  WorkspacePaneMenuActionContext,
  WorkspaceSectionMenuActionContext,
} from "./workspaceMenuTypes";

type WorkspaceMenuInvocationBase = {
  clientPoint: WorkspaceMenuClientPoint;
  direction: WorkspaceTextDirection;
  owner: HTMLElement;
  sequence: number;
};

export type WorkspaceMenuInvocation =
  | (WorkspaceMenuInvocationBase & {
      kind: "pane";
      context: WorkspacePaneMenuActionContext;
    })
  | (WorkspaceMenuInvocationBase & {
      kind: "section";
      context: WorkspaceSectionMenuActionContext | WorkspaceOutlineMenuActionContext;
      sectionIds: ReadonlyArray<string>;
    })
  | (WorkspaceMenuInvocationBase & {
      kind: "item";
      context: WorkspaceItemMenuActionContext;
    });

type WorkspaceMenuInvocationInput = WorkspaceMenuInvocation extends infer Invocation
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

export function publishWorkspaceMenuInvocation(invocation: WorkspaceMenuInvocationInput): void {
  useWorkspaceMenuState.setState({
    invocation: { ...invocation, sequence: nextWorkspaceMenuSequence } as WorkspaceMenuInvocation,
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
