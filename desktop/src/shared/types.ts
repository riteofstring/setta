import type {
  AppearancePresetList,
  AppearanceSettings,
  BackendHealth,
  CancelCodexLoginRequest,
  ChatCommandExecuteResult,
  ChatCommandListResult,
  ChatEvent,
  ChatMessage,
  CodexAccountState,
  Conversation,
  GetActiveRunResponse,
  ListConversationsResponse,
  LogoutCodexAccountRequest,
  MessagePage,
  OpenWorkspaceResponse,
  QueueMessageResult,
  ReasoningEffort,
  RefreshCodexAccountRequest,
  Run,
  RunActivityPage,
  RunItemOutputPage,
  SendMessageResult,
  StartCodexLoginRequest,
  StartCodexLoginResponse,
  SteerMessageResult,
  SubmitApprovalRequest,
  UpdateAppearanceSettingsRequest,
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

export type NiriBrowserViewRuntimeState = "destroyed" | "hidden" | "live" | "snapshot";

export interface NiriBrowserViewUpdate {
  bounds: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  focused: boolean;
  paneId: string;
  runtimeState: NiriBrowserViewRuntimeState;
  surfaceId: string;
  title: string;
  url: string;
  visible: boolean;
}

export interface NiriBrowserViewBatch {
  focusedSurfaceId: string | null;
  totalBrowserPanes: number;
  updates: NiriBrowserViewUpdate[];
  visibleBrowserPanes: number;
  workspaceId: string;
}

export interface NiriBrowserViewKeyEvent {
  key: "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp";
  surfaceId: string;
  workspaceId: string;
}

export interface NiriBrowserViewStats {
  boundsBatchCount: number;
  boundsUpdateCount: number;
  destroyed: number;
  focusedSurfaceId: string | null;
  hidden: number;
  live: number;
  registered: number;
  teardownCount: number;
  totalBrowserPanes: number;
  visibleBrowserPanes: number;
  workspaceId: string | null;
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

export interface ChatCommandExecutionOptions {
  confirmGoalReplacement?: boolean;
}

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
  niriNativeViews?: {
    batchBrowserViewUpdates: (batch: NiriBrowserViewBatch) => void;
    onBrowserViewKey: (listener: (event: NiriBrowserViewKeyEvent) => void) => () => void;
    readBrowserViewStats: () => Promise<NiriBrowserViewStats>;
    teardownBrowserViews: (workspaceId: string) => Promise<NiriBrowserViewStats>;
  };
  appearance: {
    presets: () => Promise<AppearancePresetList>;
    read: () => Promise<AppearanceSettings>;
    update: (request: UpdateAppearanceSettingsRequest) => Promise<AppearanceSettings>;
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
    executeCommand: (
      workspaceId: string,
      conversationId: string,
      raw: string,
      options?: ChatCommandExecutionOptions,
    ) => Promise<ChatCommandExecuteResult>;
    setCodexModel: (
      workspaceId: string,
      conversationId: string,
      modelId: string,
    ) => Promise<ChatCommandExecuteResult>;
    setCodexReasoningEffort: (
      workspaceId: string,
      conversationId: string,
      effort: ReasoningEffort,
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
    submitApproval: (input: SubmitApprovalRequest) => Promise<Run>;
    updateUserMessage: (
      workspaceId: string,
      conversationId: string,
      messageId: string,
      text: string,
    ) => Promise<ChatMessage>;
  };
  codexAccount: {
    cancelLogin: (request: CancelCodexLoginRequest) => Promise<CodexAccountState>;
    logout: (request: LogoutCodexAccountRequest) => Promise<CodexAccountState>;
    read: () => Promise<CodexAccountState>;
    refresh: (request: RefreshCodexAccountRequest) => Promise<CodexAccountState>;
    startLogin: (request: StartCodexLoginRequest) => Promise<StartCodexLoginResponse>;
  };
}
