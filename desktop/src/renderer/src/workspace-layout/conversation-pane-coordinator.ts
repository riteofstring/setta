import type { PresentationIntent } from "@generated/backend";

import type { WorkspaceLayoutStore } from "./layout-store";

export const conversationPaneNavigationRequestEvent = "setta:conversation-pane-navigation-request";

export interface ConversationPanePresentationRequest {
  conversationId: string;
  destination?: ConversationPanePlacementDestination;
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

export type ConversationPanePlacementDestination =
  | { kind: "new-pane" }
  | { kind: "empty-frame"; paneId: string };

export interface ConversationPanePlacementRequest {
  destination: ConversationPanePlacementDestination;
  workspaceId: string;
}

export type ConversationPanePlacementPreflightResult =
  | { kind: "ready" }
  | { kind: "blocked"; reason: string };

export type ConversationPanePresentationSuccess = Exclude<
  ConversationPanePresentationResult,
  { kind: "blocked" }
>;

export const conversationSelectedFrameMissingReason = "The selected frame no longer exists.";
export const conversationSelectedFrameNotEmptyReason = "The selected frame is no longer empty.";

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
  if (request.destination) {
    return presentNewConversationPane(store, request, request.destination);
  }
  const existingPane = matchingConversationPane(store, request);
  if (existingPane.kind === "blocked") {
    return existingPane;
  }
  if (existingPane.kind === "found") {
    clearMaximizedPane(store);
    store.focusPane(existingPane.paneId);
    return { kind: "focused", paneId: existingPane.paneId };
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
  clearMaximizedPane(store);
  return { kind: "opened", paneId: store.openPane(paneRequest) };
}

export function preflightConversationPanePlacement(
  store: WorkspaceLayoutStore,
  request: ConversationPanePlacementRequest,
): ConversationPanePlacementPreflightResult {
  if (store.toScene().id !== request.workspaceId) {
    return {
      kind: "blocked",
      reason: `Workspace ${request.workspaceId} is not mounted.`,
    };
  }
  switch (request.destination.kind) {
    case "new-pane":
      return { kind: "ready" };
    case "empty-frame":
      return emptyFramePlacementPreflight(store, request.destination.paneId);
    default:
      return assertNever(request.destination);
  }
}

function presentNewConversationPane(
  store: WorkspaceLayoutStore,
  request: ConversationPanePresentationRequest,
  destination: ConversationPanePlacementDestination,
): ConversationPanePresentationResult {
  const existingPane = matchingConversationPane(store, request);
  if (existingPane.kind === "blocked") {
    return existingPane;
  }
  if (existingPane.kind === "found") {
    return {
      kind: "blocked",
      reason: "This conversation already has an open pane.",
    };
  }
  const paneRequest = conversationPaneRequest(request.conversationId, request.title);
  switch (destination.kind) {
    case "new-pane":
      clearMaximizedPane(store);
      return { kind: "opened", paneId: store.openPane(paneRequest) };
    case "empty-frame": {
      const preflight = emptyFramePlacementPreflight(store, destination.paneId);
      if (preflight.kind === "blocked") {
        return preflight;
      }
      clearMaximizedPane(store);
      return { kind: "opened", paneId: store.configurePane(destination.paneId, paneRequest) };
    }
    default:
      return assertNever(destination);
  }
}

function emptyFramePlacementPreflight(
  store: WorkspaceLayoutStore,
  paneId: string,
): ConversationPanePlacementPreflightResult {
  const pane = store.toScene().paneById.get(paneId);
  if (!pane) {
    return { kind: "blocked", reason: conversationSelectedFrameMissingReason };
  }
  if (pane.surfaceKind !== "empty-frame") {
    return { kind: "blocked", reason: conversationSelectedFrameNotEmptyReason };
  }
  return { kind: "ready" };
}

function conversationPaneRequest(conversationId: string, title: string) {
  return {
    easyButtonConfig: { conversationId },
    subtitle: "Topic conversation",
    surfaceKind: "easy-button",
    title,
    tone: "cyan",
    widthSpec: { unit: "proportion", value: 1 },
  } as const;
}

function matchingConversationPane(
  store: WorkspaceLayoutStore,
  request: ConversationPanePresentationRequest,
): { kind: "blocked"; reason: string } | { kind: "found"; paneId: string } | { kind: "missing" } {
  const matchingPaneIds = store
    .toScene()
    .panes.filter(
      (pane) =>
        pane.surfaceKind === "easy-button" &&
        pane.easyButtonConfig.conversationId === request.conversationId,
    )
    .map((pane) => pane.paneId);
  if (matchingPaneIds.length > 1) {
    return {
      kind: "blocked",
      reason: "This conversation is already bound to multiple panes.",
    };
  }
  if (request.preferredPaneId && matchingPaneIds.includes(request.preferredPaneId)) {
    return { kind: "found", paneId: request.preferredPaneId };
  }
  const paneId = store.mostRecentlyFocusedPaneId(matchingPaneIds);
  return paneId ? { kind: "found", paneId } : { kind: "missing" };
}

function clearMaximizedPane(store: WorkspaceLayoutStore): void {
  const maximizedPaneId = store.getSnapshot().maximizedPaneId;
  if (maximizedPaneId !== null) {
    store.togglePaneMaximized(maximizedPaneId);
  }
}
