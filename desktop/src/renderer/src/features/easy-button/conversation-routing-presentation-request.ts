import type { ConversationInputRoutingState } from "@generated/backend";

export const conversationRoutingPresentationRequestEvent =
  "setta:conversation-routing-presentation-request";

export interface ConversationRoutingPresentationRequestDetail {
  completion: Promise<void> | null;
  state: ConversationInputRoutingState;
  workspaceId: string;
}

export function requestConversationRoutingPresentation(
  workspaceId: string,
  state: ConversationInputRoutingState,
): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Conversation routing presentation is unavailable."));
  }
  const detail: ConversationRoutingPresentationRequestDetail = {
    completion: null,
    state,
    workspaceId,
  };
  window.dispatchEvent(
    new CustomEvent<ConversationRoutingPresentationRequestDetail>(
      conversationRoutingPresentationRequestEvent,
      { detail },
    ),
  );
  return (
    detail.completion ??
    Promise.reject(
      new Error("The originating Easy Button pane is unavailable for the routing result."),
    )
  );
}
