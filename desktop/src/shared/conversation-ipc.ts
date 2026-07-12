import type {
  AcceptedConversationInput,
  ConversationEventCursor,
  ConversationSnapshot,
  DiscardConversationInputRequest,
  DisposeSideConversationRequest,
  CreateTopicConversationRequest,
  ListTopicConversationsRequest,
  NavigatorPage,
  ReadConversationInputRoutingStateRequest,
  ConversationInputRoutingState,
  ReadConversationSnapshotRequest,
  RetryConversationInputRequest,
  SendSideConversationTurnRequest,
  StopTopicConversationTurnRequest,
  SubmitConversationInputRequest,
  SubmitTopicConversationApprovalRequest,
  UpdateTopicConversationNarratorVoiceRequest,
} from "@generated/backend";

export const conversationIpcChannels = {
  conversationDiscardInput: "conversation:discard-input",
  conversationDisposeSide: "conversation:dispose-side",
  conversationCreateTopic: "conversation:create-topic",
  conversationListTopicConversations: "conversation:list-topic-conversations",
  conversationReadInputState: "conversation:read-input-state",
  conversationWaitInputState: "conversation:wait-input-state",
  conversationReadSnapshot: "conversation:read-snapshot",
  conversationReleaseEvents: "conversation:release-events",
  conversationRetryInput: "conversation:retry-input",
  conversationSendSideTurn: "conversation:send-side-turn",
  conversationStopTurn: "conversation:stop-turn",
  conversationSubmitInput: "conversation:submit-input",
  conversationSubmitApproval: "conversation:submit-approval",
  conversationSubscribeEvents: "conversation:subscribe-events",
  conversationUpdateNarratorVoice: "conversation:update-narrator-voice",
} as const;

export interface ConversationEventSubscriptionRequest {
  conversationId: string;
  cursor: ConversationEventCursor;
  workspaceId: string;
}

export interface ConversationEventReleaseRequest {
  conversationId: string;
  keepAlive: boolean;
  workspaceId: string;
}

export interface ConversationIpc {
  conversationDisposeSide: {
    args: [request: DisposeSideConversationRequest];
    result: ConversationSnapshot;
  };
  conversationCreateTopic: {
    args: [request: CreateTopicConversationRequest];
    result: ConversationSnapshot;
  };
  conversationDiscardInput: {
    args: [request: DiscardConversationInputRequest];
    result: ConversationInputRoutingState;
  };
  conversationListTopicConversations: {
    args: [request: ListTopicConversationsRequest];
    result: NavigatorPage;
  };
  conversationReadInputState: {
    args: [request: ReadConversationInputRoutingStateRequest];
    result: ConversationInputRoutingState;
  };
  conversationWaitInputState: {
    args: [request: ReadConversationInputRoutingStateRequest];
    result: ConversationInputRoutingState;
  };
  conversationReadSnapshot: {
    args: [request: ReadConversationSnapshotRequest];
    result: ConversationSnapshot;
  };
  conversationReleaseEvents: {
    args: [request: ConversationEventReleaseRequest];
    result: void;
  };
  conversationRetryInput: {
    args: [request: RetryConversationInputRequest];
    result: ConversationInputRoutingState;
  };
  conversationSendSideTurn: {
    args: [request: SendSideConversationTurnRequest];
    result: ConversationSnapshot;
  };
  conversationStopTurn: {
    args: [request: StopTopicConversationTurnRequest];
    result: ConversationSnapshot;
  };
  conversationSubmitInput: {
    args: [request: SubmitConversationInputRequest];
    result: AcceptedConversationInput;
  };
  conversationSubmitApproval: {
    args: [request: SubmitTopicConversationApprovalRequest];
    result: ConversationSnapshot;
  };
  conversationSubscribeEvents: {
    args: [request: ConversationEventSubscriptionRequest];
    result: void;
  };
  conversationUpdateNarratorVoice: {
    args: [request: UpdateTopicConversationNarratorVoiceRequest];
    result: ConversationSnapshot["presentationProfile"];
  };
}
