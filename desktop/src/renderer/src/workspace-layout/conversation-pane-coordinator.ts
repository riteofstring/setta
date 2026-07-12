import type { WorkspaceLayoutStore } from "./layout-store";

export const conversationPanePresentationRequestEvent =
  "setta:conversation-pane-presentation-request";

export interface ConversationPanePresentationRequest {
  conversationId: string;
  title: string;
  workspaceId: string;
}

export type ConversationPanePresentationResult =
  | { kind: "focused"; paneId: string }
  | { kind: "opened"; paneId: string }
  | { kind: "blocked"; reason: string };

export interface ConversationPanePresentationEventDetail {
  request: ConversationPanePresentationRequest;
  result: ConversationPanePresentationResult | null;
}

export function requestConversationPanePresentation(
  request: ConversationPanePresentationRequest,
): ConversationPanePresentationResult {
  if (typeof window === "undefined") {
    return { kind: "blocked", reason: "The workspace pane coordinator is unavailable." };
  }
  const detail: ConversationPanePresentationEventDetail = { request, result: null };
  window.dispatchEvent(
    new CustomEvent<ConversationPanePresentationEventDetail>(
      conversationPanePresentationRequestEvent,
      { detail },
    ),
  );
  return (
    detail.result ?? {
      kind: "blocked",
      reason: `Workspace ${request.workspaceId} is not mounted.`,
    }
  );
}

export function presentConversationPane(
  store: WorkspaceLayoutStore,
  request: ConversationPanePresentationRequest,
): ConversationPanePresentationResult {
  if (store.toScene().id !== request.workspaceId) {
    return {
      kind: "blocked",
      reason: `Workspace ${request.workspaceId} is not mounted.`,
    };
  }
  const matchingPaneIds = store
    .toScene()
    .panes.filter(
      (pane) =>
        pane.surfaceKind === "easy-button" &&
        pane.easyButtonConfig?.conversationId === request.conversationId,
    )
    .map((pane) => pane.paneId);
  const existingPaneId = store.mostRecentlyFocusedPaneId(matchingPaneIds);
  if (existingPaneId !== null) {
    clearMaximizedPane(store);
    store.focusPane(existingPaneId);
    return { kind: "focused", paneId: existingPaneId };
  }
  const paneRequest = {
    easyButtonConfig: { conversationId: request.conversationId },
    subtitle: "Topic conversation",
    surfaceKind: "easy-button",
    title: request.title,
    tone: "cyan",
    widthSpec: { unit: "proportion", value: 1 },
  } as const;
  if (!store.canOpenPane(paneRequest)) {
    return {
      kind: "blocked",
      reason: "The workspace has reached its Easy Button pane limit.",
    };
  }
  clearMaximizedPane(store);
  return { kind: "opened", paneId: store.openPane(paneRequest) };
}

function clearMaximizedPane(store: WorkspaceLayoutStore): void {
  const maximizedPaneId = store.getSnapshot().maximizedPaneId;
  if (maximizedPaneId !== null) {
    store.togglePaneMaximized(maximizedPaneId);
  }
}
