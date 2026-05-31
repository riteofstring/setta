import type {
  BackendHealth,
  ChatCommandExecuteResult,
  ChatCommandListResult,
  ChatEvent,
  ChatMaintenanceResult,
  ClearChatGPTAuthRequest,
  Conversation,
  GetActiveRunResponse,
  ListConversationsResponse,
  MessagePage,
  OpenWorkspaceResponse,
  ProviderAccounts,
  QueueMessageResult,
  Run,
  RunActivityPage,
  RunItemOutputPage,
  SaveChatGPTAuthRequest,
  SendMessageResult,
  SteerMessageResult,
  SubmitApprovalRequest,
  WorkspaceSession,
} from "@generated/backend";

export interface RuntimeVersions {
  app: string;
  chrome: string;
  electron: string;
  node: string;
}

export type DesktopPlatform =
  | "aix"
  | "android"
  | "cygwin"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "netbsd"
  | "openbsd"
  | "sunos"
  | "win32";

export interface InstalledEditorApp {
  id: string;
  displayName: string;
  iconDataUrl: string;
}

export interface WorkspaceGitInfo {
  branchName: string;
  commitShort: string;
  worktreeName: string;
  worktreeRoot: string;
}

export type BackendProcessStatus =
  | { status: "starting"; message: string }
  | { status: "online"; url: string; mode: "external" | "spawned"; message: string }
  | { status: "offline"; message: string }
  | { status: "failed"; message: string };

export type BackendEventStreamStatus =
  | { status: "connecting"; attempt: number; message: string }
  | { status: "connected"; lastSequence: number; lastStreamId: string; message: string }
  | {
      status: "reconnecting";
      attempt: number;
      lastSequence: number;
      lastStreamId: string;
      message: string;
    }
  | { status: "resyncing"; lastSequence: number; lastStreamId: string; message: string }
  | { status: "stopped"; message: string };

export interface SettaAPI {
  app: {
    installedEditors: () => Promise<InstalledEditorApp[]>;
    openWorkspaceInEditor: (editorId: string, rootPath: string) => Promise<void>;
    openExternalUrl: (url: string) => Promise<void>;
    platform: DesktopPlatform;
    versions: () => Promise<RuntimeVersions>;
    workspaceGitInfo: (rootPath: string) => Promise<WorkspaceGitInfo>;
  };
  backend: {
    health: () => Promise<BackendHealth>;
    onEventStreamStatus: (listener: (status: BackendEventStreamStatus) => void) => () => void;
    onProcessStatus: (listener: (status: BackendProcessStatus) => void) => () => void;
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
    clearQuarantine: (workspaceId: string, confirmation: string) => Promise<ChatMaintenanceResult>;
    createConversation: (workspaceId: string, title: string) => Promise<Conversation>;
    executeCommand: (
      workspaceId: string,
      conversationId: string,
      raw: string,
    ) => Promise<ChatCommandExecuteResult>;
    listCommands: (workspaceId: string, conversationId: string) => Promise<ChatCommandListResult>;
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
    runActivity: (workspaceId: string, runId: string, limit: number) => Promise<RunActivityPage>;
    runItemOutput: (
      workspaceId: string,
      runId: string,
      runItemId: string,
      afterOrdinal: number,
      limit: number,
    ) => Promise<RunItemOutputPage>;
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
    quarantineCorruptState: (
      workspaceId: string,
      confirmation: string,
    ) => Promise<ChatMaintenanceResult>;
    resetWorkspaceState: (
      workspaceId: string,
      confirmation: string,
    ) => Promise<ChatMaintenanceResult>;
    submitApproval: (input: SubmitApprovalRequest) => Promise<Run>;
  };
  providerAccounts: {
    clearChatGPTAuth: (request: ClearChatGPTAuthRequest) => Promise<ProviderAccounts>;
    list: () => Promise<ProviderAccounts>;
    saveChatGPTAuth: (request: SaveChatGPTAuthRequest) => Promise<ProviderAccounts>;
  };
}
