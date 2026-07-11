import type { WorkspaceLayoutStore } from "./layout-store";

export interface ConversationPanePresentationRequest {
  conversationId: string;
  title: string;
  workspaceId: string;
}

export type ConversationPanePresentationResult =
  | { kind: "focused"; paneId: string }
  | { kind: "opened"; paneId: string }
  | { kind: "blocked"; reason: string };

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
  return { kind: "opened", paneId: store.openPane(paneRequest) };
}
