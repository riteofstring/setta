import type {
  AcceptedConversationInput,
  AskTopicConversationNarratorStatusRequest,
  ConversationEventCursor,
  ConversationSnapshot,
  CreateSideConversationRequest,
  DiscardConversationInputRequest,
  DisposeSideConversationRequest,
  CreateTopicConversationRequest,
  ForkTopicConversationRequest,
  ListTopicConversationsRequest,
  NavigatorPage,
  QueueTopicConversationTurnRequest,
  ReadConversationInputRoutingStateRequest,
  ConversationInputRoutingState,
  ReadConversationSnapshotRequest,
  RetryConversationInputRequest,
  SendTopicConversationTurnRequest,
  SendSideConversationTurnRequest,
  SteerTopicConversationTurnRequest,
  StopTopicConversationTurnRequest,
  SubmitConversationInputRequest,
  SubmitTopicConversationApprovalRequest,
  UpdateTopicConversationNarratorVoiceRequest,
} from "@generated/backend";

export const conversationIpcChannels = {
  conversationAskNarratorStatus: "conversation:ask-narrator-status",
  conversationCreateSide: "conversation:create-side",
  conversationDiscardInput: "conversation:discard-input",
  conversationDisposeSide: "conversation:dispose-side",
  conversationCreateTopic: "conversation:create-topic",
  conversationForkTopic: "conversation:fork-topic",
  conversationListTopicConversations: "conversation:list-topic-conversations",
  conversationQueueTurn: "conversation:queue-turn",
  conversationReadInputState: "conversation:read-input-state",
  conversationWaitInputState: "conversation:wait-input-state",
  conversationReadSnapshot: "conversation:read-snapshot",
  conversationReleaseEvents: "conversation:release-events",
  conversationRetryInput: "conversation:retry-input",
  conversationSendTurn: "conversation:send-turn",
  conversationSendSideTurn: "conversation:send-side-turn",
  conversationSteerTurn: "conversation:steer-turn",
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
  conversationAskNarratorStatus: {
    args: [request: AskTopicConversationNarratorStatusRequest];
    result: ConversationSnapshot;
  };
  conversationCreateSide: {
    args: [request: CreateSideConversationRequest];
    result: ConversationSnapshot;
  };
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
  conversationForkTopic: {
    args: [request: ForkTopicConversationRequest];
    result: ConversationSnapshot;
  };
  conversationListTopicConversations: {
    args: [request: ListTopicConversationsRequest];
    result: NavigatorPage;
  };
  conversationQueueTurn: {
    args: [request: QueueTopicConversationTurnRequest];
    result: ConversationSnapshot;
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
  conversationSendTurn: {
    args: [request: SendTopicConversationTurnRequest];
    result: ConversationSnapshot;
  };
  conversationSendSideTurn: {
    args: [request: SendSideConversationTurnRequest];
    result: ConversationSnapshot;
  };
  conversationSteerTurn: {
    args: [request: SteerTopicConversationTurnRequest];
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
