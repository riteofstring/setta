import type {
  Artifact,
  ArchiveTopicConversationRequest,
  BindTopicConversationFolderRequest,
  ConversationEventCursor,
  ConversationSnapshot,
  DisposeSideConversationRequest,
  CreateTopicConversationRequest,
  ListTopicConversationsRequest,
  NavigatorPage,
  ReadConversationArtifactRequest,
  ReadConversationSnapshotRequest,
  SendSideConversationTurnRequest,
  StopTopicConversationTurnRequest,
  SubmitTopicConversationApprovalRequest,
} from "@generated/backend";

export const conversationIpcChannels = {
  conversationArchiveTopic: "conversation:archive-topic",
  conversationBindFolder: "conversation:bind-folder",
  conversationDisposeSide: "conversation:dispose-side",
  conversationCreateTopic: "conversation:create-topic",
  conversationListTopicConversations: "conversation:list-topic-conversations",
  conversationReadArtifact: "conversation:read-artifact",
  conversationReadSnapshot: "conversation:read-snapshot",
  conversationReleaseEvents: "conversation:release-events",
  conversationSendSideTurn: "conversation:send-side-turn",
  conversationStopTurn: "conversation:stop-turn",
  conversationSubmitApproval: "conversation:submit-approval",
  conversationSubscribeEvents: "conversation:subscribe-events",
} as const;

export interface ConversationEventSubscriptionRequest {
  conversationId: string;
  cursor: ConversationEventCursor;
  workspaceId: string | null;
}

export interface ConversationEventReleaseRequest {
  conversationId: string;
  keepAlive: boolean;
  workspaceId: string | null;
}

export interface ConversationIpc {
  conversationArchiveTopic: {
    args: [request: ArchiveTopicConversationRequest];
    result: ConversationSnapshot;
  };
  conversationBindFolder: {
    args: [request: BindTopicConversationFolderRequest];
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
  conversationListTopicConversations: {
    args: [request: ListTopicConversationsRequest];
    result: NavigatorPage;
  };
  conversationReadArtifact: {
    args: [request: ReadConversationArtifactRequest];
    result: Artifact;
  };
  conversationReadSnapshot: {
    args: [request: ReadConversationSnapshotRequest];
    result: ConversationSnapshot;
  };
  conversationReleaseEvents: {
    args: [request: ConversationEventReleaseRequest];
    result: void;
  };
  conversationSendSideTurn: {
    args: [request: SendSideConversationTurnRequest];
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
