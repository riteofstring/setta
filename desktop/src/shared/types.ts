import type {
  BackendHealth,
  ApprovalAnswer,
  ChatEvent,
  Conversation,
  GetActiveRunResponse,
  ListConversationsResponse,
  MessagePage,
  OpenWorkspaceResponse,
  QueueMessageResult,
  Run,
  RunActivityPage,
  SendMessageResult,
  SteerMessageResult,
  WorkspaceSession,
} from "@generated/backend";

export interface RuntimeVersions {
  app: string;
  chrome: string;
  electron: string;
  node: string;
}

export interface SubmitApprovalInput {
  workspaceId: string;
  conversationId: string;
  approvalId: string;
  approved: boolean;
  answers: ApprovalAnswer[];
  response: string;
  cancelled: boolean;
}

export interface SettaAPI {
  app: {
    versions: () => Promise<RuntimeVersions>;
  };
  backend: {
    health: () => Promise<BackendHealth>;
  };
  workspace: {
    close: (id: string) => Promise<WorkspaceSession>;
    openLocalFolder: () => Promise<OpenWorkspaceResponse | null>;
    removeRecent: (id: string) => Promise<WorkspaceSession>;
    reorder: (ids: string[]) => Promise<WorkspaceSession>;
    select: (id: string) => Promise<WorkspaceSession>;
    session: () => Promise<WorkspaceSession>;
  };
  chat: {
    activeRun: (workspaceId: string, conversationId: string) => Promise<GetActiveRunResponse>;
    cancelRun: (workspaceId: string, conversationId: string) => Promise<Run>;
    createConversation: (workspaceId: string, title: string) => Promise<Conversation>;
    listConversations: (workspaceId: string) => Promise<ListConversationsResponse>;
    messagePage: (
      workspaceId: string,
      conversationId: string,
      beforeOrdinal: number,
      limit: number,
    ) => Promise<MessagePage>;
    queueMessage: (
      workspaceId: string,
      conversationId: string,
      prompt: string,
    ) => Promise<QueueMessageResult>;
    runActivity: (
      workspaceId: string,
      runId: string,
      afterOrdinal: number,
      limit: number,
    ) => Promise<RunActivityPage>;
    sendMessage: (
      workspaceId: string,
      conversationId: string,
      prompt: string,
    ) => Promise<SendMessageResult>;
    steerMessage: (
      workspaceId: string,
      conversationId: string,
      prompt: string,
    ) => Promise<SteerMessageResult>;
    onEvent: (listener: (event: ChatEvent) => void) => () => void;
    submitApproval: (input: SubmitApprovalInput) => Promise<Run>;
  };
}
