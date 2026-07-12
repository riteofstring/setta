import type { PresentationIntent } from "@generated/backend";

import type { WorkspaceLayoutStore } from "./layout-store";

export const conversationPaneNavigationRequestEvent = "setta:conversation-pane-navigation-request";

export interface ConversationPanePresentationRequest {
  conversationId: string;
  preferredPaneId?: string | null;
  title: string;
  workspaceId: string;
}

export interface ConversationPaneNavigationEventDetail {
  completion: Promise<ConversationPanePresentationResult> | null;
  request: ConversationPanePresentationRequest;
}

export type ConversationPanePresentationResult =
  | { kind: "focused"; paneId: string }
  | { kind: "opened"; paneId: string }
  | { kind: "blocked"; reason: string };

export type ConversationPanePresentationSuccess = Exclude<
  ConversationPanePresentationResult,
  { kind: "blocked" }
>;

export function conversationPaneRequestForPresentationIntent(
  intent: PresentationIntent,
): ConversationPanePresentationRequest | null {
  switch (intent.kind) {
    case "focus_existing_conversation_pane":
      return presentationTargetRequest(
        requiredPayload(intent.focusExistingConversationPane, intent),
      );
    case "open_conversation_pane":
      return presentationTargetRequest(requiredPayload(intent.openConversationPane, intent));
    case "open_side_conversation_in_parent_pane":
      return presentationTargetRequest(requiredPayload(intent.openSideConversation, intent));
    case "show_master_reply":
      requiredPayload(intent.showMasterReply, intent);
      return null;
    default:
      return assertNever(intent.kind);
  }
}

function presentationTargetRequest(payload: {
  target: {
    conversationId: string;
    preferredPaneId: string | null;
    title: string;
    workspaceId: string;
  };
}): ConversationPanePresentationRequest {
  return {
    conversationId: payload.target.conversationId,
    preferredPaneId: payload.target.preferredPaneId,
    title: payload.target.title,
    workspaceId: payload.target.workspaceId,
  };
}

function requiredPayload<Payload>(payload: Payload | null, intent: PresentationIntent): Payload {
  if (payload === null) {
    throw new Error(
      `Master presentation intent ${intent.id} is missing its ${intent.kind} payload.`,
    );
  }
  return payload;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported master presentation intent: ${String(value)}`);
}

export function requestConversationPaneNavigation(
  request: ConversationPanePresentationRequest,
): Promise<ConversationPanePresentationResult> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The application pane coordinator is unavailable."));
  }
  const detail: ConversationPaneNavigationEventDetail = { completion: null, request };
  window.dispatchEvent(
    new CustomEvent<ConversationPaneNavigationEventDetail>(conversationPaneNavigationRequestEvent, {
      detail,
    }),
  );
  return (
    detail.completion ??
    Promise.reject(new Error("The application pane coordinator is unavailable."))
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
        pane.easyButtonConfig.conversationId === request.conversationId,
    )
    .map((pane) => pane.paneId);
  const existingPaneId =
    request.preferredPaneId && matchingPaneIds.includes(request.preferredPaneId)
      ? request.preferredPaneId
      : store.mostRecentlyFocusedPaneId(matchingPaneIds);
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
  const onlyPane = store.toScene().panes.length === 1 ? store.toScene().panes[0] : undefined;
  if (onlyPane?.surfaceKind === "empty-frame") {
    clearMaximizedPane(store);
    return { kind: "opened", paneId: store.configurePane(onlyPane.paneId, paneRequest) };
  }
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
