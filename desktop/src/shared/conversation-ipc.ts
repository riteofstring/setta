import type {
  AcceptedConversationInput,
  Artifact,
  ArchiveTopicConversationRequest,
  BindTopicConversationFolderRequest,
  ConversationEventCursor,
  ConversationSnapshot,
  DiscardConversationInputRequest,
  DisposeSideConversationRequest,
  CreateTopicConversationRequest,
  ListTopicConversationsRequest,
  NavigatorPage,
  ReadConversationInputRoutingStateRequest,
  ReadConversationArtifactRequest,
  ConversationInputRoutingState,
  ReadConversationSnapshotRequest,
  RetryConversationInputRequest,
  SendSideConversationTurnRequest,
  StopTopicConversationTurnRequest,
  SubmitConversationInputRequest,
  SubmitTopicConversationApprovalRequest,
  UpdateTopicConversationPresentationRequest,
} from "@generated/backend";

export const conversationIpcChannels = {
  conversationArchiveTopic: "conversation:archive-topic",
  conversationBindFolder: "conversation:bind-folder",
  conversationDiscardInput: "conversation:discard-input",
  conversationDisposeSide: "conversation:dispose-side",
  conversationCreateTopic: "conversation:create-topic",
  conversationListTopicConversations: "conversation:list-topic-conversations",
  conversationReadInputState: "conversation:read-input-state",
  conversationReadArtifact: "conversation:read-artifact",
  conversationWaitInputState: "conversation:wait-input-state",
  conversationReadSnapshot: "conversation:read-snapshot",
  conversationReleaseEvents: "conversation:release-events",
  conversationRetryInput: "conversation:retry-input",
  conversationSendSideTurn: "conversation:send-side-turn",
  conversationStopTurn: "conversation:stop-turn",
  conversationSubmitInput: "conversation:submit-input",
  conversationSubmitApproval: "conversation:submit-approval",
  conversationSubscribeEvents: "conversation:subscribe-events",
  conversationUpdatePresentation: "conversation:update-presentation",
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
  conversationReadArtifact: {
    args: [request: ReadConversationArtifactRequest];
    result: Artifact;
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
  conversationUpdatePresentation: {
    args: [request: UpdateTopicConversationPresentationRequest];
    result: ConversationSnapshot["presentationProfile"];
  };
}
