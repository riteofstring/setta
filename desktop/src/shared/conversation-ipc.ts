import type {
  AcceptedConversationInput,
  AskTopicConversationNarratorStatusRequest,
  ConversationEventCursor,
  ConversationSnapshot,
  CreateSideConversationRequest,
  CreateTopicConversationRequest,
  ForkTopicConversationRequest,
  ListTopicConversationsRequest,
  NavigatorPage,
  QueueTopicConversationTurnRequest,
  ReadConversationSnapshotRequest,
  SendTopicConversationTurnRequest,
  SteerTopicConversationTurnRequest,
  StopTopicConversationTurnRequest,
  SubmitConversationInputRequest,
  SubmitTopicConversationApprovalRequest,
  UpdateTopicConversationNarratorVoiceRequest,
} from "@generated/backend";

export const conversationIpcChannels = {
  conversationAskNarratorStatus: "conversation:ask-narrator-status",
  conversationCreateSide: "conversation:create-side",
  conversationCreateTopic: "conversation:create-topic",
  conversationForkTopic: "conversation:fork-topic",
  conversationListTopicConversations: "conversation:list-topic-conversations",
  conversationQueueTurn: "conversation:queue-turn",
  conversationReadSnapshot: "conversation:read-snapshot",
  conversationReleaseEvents: "conversation:release-events",
  conversationSendTurn: "conversation:send-turn",
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
  conversationCreateTopic: {
    args: [request: CreateTopicConversationRequest];
    result: ConversationSnapshot;
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
  conversationReadSnapshot: {
    args: [request: ReadConversationSnapshotRequest];
    result: ConversationSnapshot;
  };
  conversationReleaseEvents: {
    args: [request: ConversationEventReleaseRequest];
    result: void;
  };
  conversationSendTurn: {
    args: [request: SendTopicConversationTurnRequest];
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
