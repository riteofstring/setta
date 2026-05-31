import type {
  BackendHealth,
  ApprovalAnswer,
  ChatEvent,
  ChatMessage,
  Conversation,
  GetActiveRunResponse,
  ListConversationsResponse,
  MessagePage,
  OpenWorkspaceResponse,
  Run,
  SendMessageResult,
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
    installedEditors: () => Promise<InstalledEditorApp[]>;
    openWorkspaceInEditor: (editorId: string, rootPath: string) => Promise<void>;
    platform: DesktopPlatform;
    versions: () => Promise<RuntimeVersions>;
    workspaceGitInfo: (rootPath: string) => Promise<WorkspaceGitInfo>;
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
    deleteConversation: (
      workspaceId: string,
      conversationId: string,
    ) => Promise<ListConversationsResponse>;
    listConversations: (workspaceId: string) => Promise<ListConversationsResponse>;
    messagePage: (
      workspaceId: string,
      conversationId: string,
      beforeOrdinal: number,
      limit: number,
    ) => Promise<MessagePage>;
    sendMessage: (
      workspaceId: string,
      conversationId: string,
      prompt: string,
    ) => Promise<SendMessageResult>;
    onEvent: (listener: (event: ChatEvent) => void) => () => void;
    submitApproval: (input: SubmitApprovalInput) => Promise<Run>;
    updateUserMessage: (
      workspaceId: string,
      conversationId: string,
      messageId: string,
      text: string,
    ) => Promise<ChatMessage>;
  };
}
