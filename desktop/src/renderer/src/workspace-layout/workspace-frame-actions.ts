import { requestConversationCreation } from "../features/easy-button/conversation-creation-command";
import type { ConversationPanePlacementDestination } from "./conversation-pane-coordinator";
import type { WorkspaceLayoutStore, WorkspacePaneLimitState } from "./layout-store";
import type { NonConversationSurfaceKind, OpenPaneRequest, PaneId } from "./types";
import { emptyWorkspaceRuntimeId } from "./workspace-layout-area-runtime";
import type { WorkspaceRuntime } from "./workspace-runtime";

export type SurfaceFrameActionRequest = OpenPaneRequest & {
  conversationConfig?: never;
  surfaceKind?: NonConversationSurfaceKind;
};

export type WorkspaceFrameAction =
  | {
      kind: "surface";
      request: SurfaceFrameActionRequest;
    }
  | {
      kind: "conversation";
    };

export type WorkspaceFrameActionPlacement =
  | { kind: "new-pane" }
  | { kind: "empty-frame"; paneId: PaneId };

export interface WorkspaceFrameActionExecutionContext {
  action: WorkspaceFrameAction;
  placement: WorkspaceFrameActionPlacement;
  runLayoutAction: (action: () => void) => Promise<unknown> | void;
  runtime: WorkspaceRuntime;
}

export function workspaceFrameActionLimitState(
  store: WorkspaceLayoutStore,
  action: WorkspaceFrameAction,
): WorkspacePaneLimitState | null {
  switch (action.kind) {
    case "surface":
      return store.paneLimitState(action.request);
    case "conversation":
      return null;
    default:
      return assertNever(action);
  }
}

export function workspaceFrameActionAllowed(
  store: WorkspaceLayoutStore,
  action: WorkspaceFrameAction,
): boolean {
  switch (action.kind) {
    case "surface":
      return store.canOpenPane(action.request);
    case "conversation":
      return true;
    default:
      return assertNever(action);
  }
}

export function executeWorkspaceFrameAction({
  action,
  placement,
  runLayoutAction,
  runtime,
}: WorkspaceFrameActionExecutionContext): boolean | Promise<boolean> {
  switch (action.kind) {
    case "surface":
      return executeSurfaceFrameAction(action.request, placement, runLayoutAction, runtime.store);
    case "conversation":
      return requestConversationCreation({
        destination: conversationDestinationForPlacement(placement),
        workspaceId: conversationWorkspaceIdForRuntime(runtime.scene.id),
      }).then(
        () => true,
        () => false,
      );
    default:
      return assertNever(action);
  }
}

function executeSurfaceFrameAction(
  request: SurfaceFrameActionRequest,
  placement: WorkspaceFrameActionPlacement,
  runLayoutAction: (action: () => void) => Promise<unknown> | void,
  store: WorkspaceLayoutStore,
): boolean {
  if (!store.canOpenPane(request)) {
    return false;
  }
  switch (placement.kind) {
    case "new-pane":
      runLayoutAction(() => store.openPane(request));
      return true;
    case "empty-frame":
      runLayoutAction(() => store.configurePane(placement.paneId, request));
      return true;
    default:
      return assertNever(placement);
  }
}

function conversationDestinationForPlacement(
  placement: WorkspaceFrameActionPlacement,
): ConversationPanePlacementDestination {
  switch (placement.kind) {
    case "new-pane":
      return { kind: "new-pane" };
    case "empty-frame":
      return { kind: "empty-frame", paneId: placement.paneId };
    default:
      return assertNever(placement);
  }
}

function conversationWorkspaceIdForRuntime(runtimeWorkspaceId: string): string | null {
  return runtimeWorkspaceId === emptyWorkspaceRuntimeId ? null : runtimeWorkspaceId;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace frame action: ${String(value)}`);
}
