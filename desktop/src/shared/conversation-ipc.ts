import type {
  ConversationEventCursor,
  ConversationSnapshot,
  CreateTopicConversationRequest,
  ListTopicConversationsRequest,
  NavigatorPage,
  QueueTopicConversationTurnRequest,
  ReadConversationSnapshotRequest,
  SendTopicConversationTurnRequest,
  SteerTopicConversationTurnRequest,
  StopTopicConversationTurnRequest,
  SubmitTopicConversationApprovalRequest,
} from "@generated/backend";

export const conversationIpcChannels = {
  conversationCreateTopic: "conversation:create-topic",
  conversationListTopicConversations: "conversation:list-topic-conversations",
  conversationQueueTurn: "conversation:queue-turn",
  conversationReadSnapshot: "conversation:read-snapshot",
  conversationReleaseEvents: "conversation:release-events",
  conversationSendTurn: "conversation:send-turn",
  conversationSteerTurn: "conversation:steer-turn",
  conversationStopTurn: "conversation:stop-turn",
  conversationSubmitApproval: "conversation:submit-approval",
  conversationSubscribeEvents: "conversation:subscribe-events",
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
  conversationCreateTopic: {
    args: [request: CreateTopicConversationRequest];
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
  conversationSubmitApproval: {
    args: [request: SubmitTopicConversationApprovalRequest];
    result: ConversationSnapshot;
  };
  conversationSubscribeEvents: {
    args: [request: ConversationEventSubscriptionRequest];
    result: void;
  };
}
