import type {
  AppearancePresetList,
  AppearanceSettings,
  AttachSemanticNodeToChatMessageRequest,
  AttachSemanticNodeToChatRunRequest,
  AttachSemanticNodeToFileRangeRequest,
  AttachSemanticNodeToRunItemRequest,
  AttachSemanticNodeToWorkflowExecutionRequest,
  AttachSemanticNodeToWorkflowNodeRequest,
  BackendHealth,
  BuildCartographerWindowRequest,
  CancelCodexLoginRequest,
  CartographerCursorList,
  CartographerPatchList,
  CartographerPatchReviewResult,
  CartographerRunList,
  CartographerRunReadResponse,
  CartographerWindowBuildResult,
  CartographerWindowList,
  ChatCommandExecuteResult,
  ChatCommandListResult,
  ChatEvent,
  CodexAccountState,
  Conversation,
  ConversationListItem,
  CreateSemanticEdgeRequest,
  CreateSemanticNodeRequest,
  CreateSemanticSteeringDirectiveRequest,
  CreateTerminalProfileRequest,
  DeleteTerminalProfileRequest,
  DeleteWorkflowDefinitionResponse,
  EndSemanticActivityRequest,
  GetActiveRunResponse,
  ImmediateSteeringResult,
  ListCartographerCursorsRequest,
  ListCartographerPatchesRequest,
  ListCartographerRunsRequest,
  ListCartographerWindowsRequest,
  ListConversationsResponse,
  ListSemanticContextPacksRequest,
  ListWorkflowDefinitionsResponse,
  LogoutCodexAccountRequest,
  MergeSemanticNodesRequest,
  MessagePage,
  OpenWorkspaceResponse,
  QueueEditResult,
  QueueMessageResult,
  QueueRemoveResult,
  RenameSemanticNodeRequest,
  ReadCartographerRunRequest,
  ReadSemanticActivitySummaryRequest,
  ReadSemanticContextPackRequest,
  ReadSemanticEventHistoryRequest,
  ReadSemanticGraphRequest,
  ReadSemanticNodeDetailRequest,
  ReadSemanticNodeDetailResponse,
  ReadSemanticSteeringStateRequest,
  ReadWorkflowGraphProjectionResponse,
  ReasoningEffort,
  RefreshCodexAccountRequest,
  ResizeTerminalRequest,
  ReviewCartographerPatchRequest,
  Run,
  RunActivityPage,
  RunItemOutputPage,
  ListSemanticActivityPageRequest,
  ListSemanticActivityRequest,
  ListSemanticEvidenceRequest,
  SemanticActivityEndResult,
  SemanticActivityList,
  SemanticActivityPage,
  SemanticActivitySummary,
  SemanticAttachmentResult,
  SemanticContextPackList,
  SemanticContextPackReadResponse,
  SemanticEdgeOperationRequest,
  SemanticEventHistory,
  SemanticEvidenceList,
  SemanticGraph,
  SemanticLayoutPositionList,
  SemanticMutationResult,
  SemanticNodeOperationRequest,
  SemanticSteeringState,
  SendMessageResult,
  SelectDefaultTerminalProfileRequest,
  StartCodexLoginRequest,
  StartCodexLoginResponse,
  SteerMessageResult,
  SplitSemanticNodeRequest,
  SubmitApprovalRequest,
  SubmitWorkflowApprovalRequest,
  TerminalEvent,
  TerminalInputRequest,
  TerminalInputResponse,
  TerminalProfileList,
  TerminalSessionResponse,
  UpdateAppearanceSettingsRequest,
  UpdateSemanticEdgeRequest,
  UpdateSemanticLayoutPositionsRequest,
  UpdateSemanticNodeRequest,
  UpdateSemanticSteeringDirectiveRequest,
  UpdateTerminalProfileRequest,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowExecution,
  WorkflowExecutionEventPage,
  WorkflowGraph,
  WorkflowValidationResult,
  WorkspaceSelectedConversations,
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

export interface AppWindowDragPoint {
  screenX: number;
  screenY: number;
}

export type WorkspaceBrowserViewRuntimeState = "destroyed" | "hidden" | "live" | "snapshot";

export interface WorkspaceBrowserViewUpdate {
  bounds: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  contentBounds: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  focused: boolean;
  paneId: string;
  runtimeState: WorkspaceBrowserViewRuntimeState;
  surfaceId: string;
  title: string;
  url: string;
  visible: boolean;
}

export interface WorkspaceBrowserViewBatch {
  focusedSurfaceId: string | null;
  totalBrowserPanes: number;
  updates: WorkspaceBrowserViewUpdate[];
  visibleBrowserPanes: number;
  workspaceId: string;
}

export type WorkspaceBrowserViewKey =
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "Backspace"
  | "Delete"
  | "Enter"
  | "b"
  | "c"
  | "g"
  | "n"
  | "o"
  | "s"
  | "t"
  | "v";

export interface WorkspaceBrowserViewKeyEvent {
  altKey: boolean;
  key: WorkspaceBrowserViewKey;
  metaKey: boolean;
  shiftKey: boolean;
  surfaceId: string;
  workspaceId: string;
}

export interface WorkspaceBrowserViewSnapshot {
  capturedAt: number;
  height: number;
  imageDataUrl: string;
  paneId: string;
  surfaceId: string;
  title: string;
  width: number;
  workspaceId: string;
}

export interface WorkspaceBrowserViewStats {
  boundsBatchCount: number;
  boundsUpdateCount: number;
  contentLoaded: number;
  destroyed: number;
  focusedSurfaceId: string | null;
  hidden: number;
  live: number;
  loading: number;
  registered: number;
  snapshotCaptureLastError: string | null;
  snapshotCapturesFailed: number;
  snapshotCapturesStarted: number;
  snapshotCapturesSucceeded: number;
  snapshotsInFlight: number;
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
    flags: {
      workflowGraphDebug: boolean;
      workflowGraphSyntheticGraph: {
        edgesPerNode: number;
        nodeCount: number;
      } | null;
    };
    installedEditors: () => Promise<InstalledEditorApp[]>;
    endWindowDrag: () => Promise<void>;
    moveWindowDrag: (point: AppWindowDragPoint) => Promise<void>;
    openWorkspaceInEditor: (editorId: string, rootPath: string) => Promise<void>;
    openExternalUrl: (url: string) => Promise<void>;
    platform: DesktopPlatform;
    startWindowDrag: (point: AppWindowDragPoint) => Promise<void>;
    versions: () => Promise<RuntimeVersions>;
    workspaceGitInfo: (rootPath: string) => Promise<WorkspaceGitInfo>;
  };
  backend: {
    health: () => Promise<BackendHealth>;
    onEventStreamStatus: (listener: (status: BackendEventStreamStatus) => void) => () => void;
    onProcessStatus: (listener: (status: BackendProcessStatus) => void) => () => void;
  };
  appearance: {
    presets: () => Promise<AppearancePresetList>;
    read: () => Promise<AppearanceSettings>;
    update: (request: UpdateAppearanceSettingsRequest) => Promise<AppearanceSettings>;
  };
  workspaceNativeViews?: {
    batchBrowserViewUpdates: (batch: WorkspaceBrowserViewBatch) => void;
    onBrowserViewKey: (listener: (event: WorkspaceBrowserViewKeyEvent) => void) => () => void;
    onBrowserViewSnapshot: (
      listener: (snapshot: WorkspaceBrowserViewSnapshot) => void,
    ) => () => void;
    readBrowserViewStats: () => Promise<WorkspaceBrowserViewStats>;
    teardownBrowserViews: (workspaceId: string) => Promise<WorkspaceBrowserViewStats>;
  };
  terminal: {
    attach: (workspaceId: string, paneId: string) => Promise<TerminalSessionResponse>;
    close: (sessionId: string, mode: "terminate" | "kill") => Promise<TerminalSessionResponse>;
    createProfile: (request: CreateTerminalProfileRequest) => Promise<TerminalProfileList>;
    create: (
      workspaceId: string,
      paneId: string,
      options: {
        cols: number;
        cwd?: string;
        profileId?: string;
        rows: number;
      },
    ) => Promise<TerminalSessionResponse>;
    deleteProfile: (request: DeleteTerminalProfileRequest) => Promise<TerminalProfileList>;
    input: (input: TerminalInputRequest) => Promise<TerminalInputResponse>;
    listProfiles: () => Promise<TerminalProfileList>;
    onEvent: (listener: (event: TerminalEvent) => void) => () => void;
    resize: (request: ResizeTerminalRequest) => Promise<TerminalSessionResponse>;
    selectDefaultProfile: (
      request: SelectDefaultTerminalProfileRequest,
    ) => Promise<TerminalProfileList>;
    updateProfile: (request: UpdateTerminalProfileRequest) => Promise<TerminalProfileList>;
  };
  workspace: {
    close: (id: string) => Promise<WorkspaceSession>;
    openLocalFolder: () => Promise<OpenWorkspaceResponse | null>;
    openPath: (rootPath: string) => Promise<OpenWorkspaceResponse>;
    removeRecent: (id: string) => Promise<WorkspaceSession>;
    reorder: (ids: string[]) => Promise<WorkspaceSession>;
    select: (id: string) => Promise<WorkspaceSession>;
    selectedConversations: () => Promise<WorkspaceSelectedConversations>;
    setSelectedConversation: (
      workspaceId: string,
      conversationId: string,
    ) => Promise<WorkspaceSelectedConversations>;
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
    editQueuedMessage: (
      workspaceId: string,
      conversationId: string,
      messageId: string,
      prompt: string,
    ) => Promise<QueueEditResult>;
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
    setConversationPinned: (
      workspaceId: string,
      conversationId: string,
      pinned: boolean,
    ) => Promise<ConversationListItem>;
    listCommands: (workspaceId: string, conversationId: string) => Promise<ChatCommandListResult>;
    listConversations: (workspaceId: string) => Promise<ListConversationsResponse>;
    markConversationRead: (
      workspaceId: string,
      conversationId: string,
    ) => Promise<ConversationListItem>;
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
    removeQueuedMessage: (
      workspaceId: string,
      conversationId: string,
      messageId: string,
    ) => Promise<QueueRemoveResult>;
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
    sendSteeringImmediately: (
      workspaceId: string,
      conversationId: string,
      prompt?: string,
    ) => Promise<ImmediateSteeringResult>;
    steerMessage: (
      workspaceId: string,
      conversationId: string,
      prompt: string,
    ) => Promise<SteerMessageResult>;
    onEvent: (listener: (event: ChatEvent) => void) => () => void;
    submitApproval: (input: SubmitApprovalRequest) => Promise<Run>;
  };
  codexAccount: {
    cancelLogin: (request: CancelCodexLoginRequest) => Promise<CodexAccountState>;
    logout: (request: LogoutCodexAccountRequest) => Promise<CodexAccountState>;
    read: () => Promise<CodexAccountState>;
    refresh: (request: RefreshCodexAccountRequest) => Promise<CodexAccountState>;
    startLogin: (request: StartCodexLoginRequest) => Promise<StartCodexLoginResponse>;
  };
  semanticGraph: {
    attachChatMessage: (
      request: AttachSemanticNodeToChatMessageRequest,
    ) => Promise<SemanticAttachmentResult>;
    attachChatRun: (
      request: AttachSemanticNodeToChatRunRequest,
    ) => Promise<SemanticAttachmentResult>;
    attachFileRange: (
      request: AttachSemanticNodeToFileRangeRequest,
    ) => Promise<SemanticAttachmentResult>;
    attachRunItem: (
      request: AttachSemanticNodeToRunItemRequest,
    ) => Promise<SemanticAttachmentResult>;
    attachWorkflowExecution: (
      request: AttachSemanticNodeToWorkflowExecutionRequest,
    ) => Promise<SemanticAttachmentResult>;
    attachWorkflowNode: (
      request: AttachSemanticNodeToWorkflowNodeRequest,
    ) => Promise<SemanticAttachmentResult>;
    buildCartographerWindow: (
      request: BuildCartographerWindowRequest,
    ) => Promise<CartographerWindowBuildResult>;
    listCartographerCursors: (
      request: ListCartographerCursorsRequest,
    ) => Promise<CartographerCursorList>;
    listCartographerPatches: (
      request: ListCartographerPatchesRequest,
    ) => Promise<CartographerPatchList>;
    listCartographerRuns: (request: ListCartographerRunsRequest) => Promise<CartographerRunList>;
    listCartographerWindows: (
      request: ListCartographerWindowsRequest,
    ) => Promise<CartographerWindowList>;
    readCartographerRun: (
      request: ReadCartographerRunRequest,
    ) => Promise<CartographerRunReadResponse>;
    acceptCartographerPatch: (
      request: ReviewCartographerPatchRequest,
    ) => Promise<CartographerPatchReviewResult>;
    rejectCartographerPatch: (
      request: ReviewCartographerPatchRequest,
    ) => Promise<CartographerPatchReviewResult>;
    createEdge: (request: CreateSemanticEdgeRequest) => Promise<SemanticMutationResult>;
    createNode: (request: CreateSemanticNodeRequest) => Promise<SemanticMutationResult>;
    createSteeringDirective: (
      request: CreateSemanticSteeringDirectiveRequest,
    ) => Promise<SemanticMutationResult>;
    dismissNode: (request: SemanticNodeOperationRequest) => Promise<SemanticMutationResult>;
    endActivity: (request: EndSemanticActivityRequest) => Promise<SemanticActivityEndResult>;
    listActivity: (request: ListSemanticActivityRequest) => Promise<SemanticActivityList>;
    listActivityPage: (request: ListSemanticActivityPageRequest) => Promise<SemanticActivityPage>;
    listContextPacks: (
      request: ListSemanticContextPacksRequest,
    ) => Promise<SemanticContextPackList>;
    listEvidence: (request: ListSemanticEvidenceRequest) => Promise<SemanticEvidenceList>;
    mergeNodes: (request: MergeSemanticNodesRequest) => Promise<SemanticMutationResult>;
    promoteNode: (request: SemanticNodeOperationRequest) => Promise<SemanticMutationResult>;
    read: (request: ReadSemanticGraphRequest) => Promise<SemanticGraph>;
    readActivitySummary: (
      request: ReadSemanticActivitySummaryRequest,
    ) => Promise<SemanticActivitySummary>;
    readContextPack: (
      request: ReadSemanticContextPackRequest,
    ) => Promise<SemanticContextPackReadResponse>;
    readEventHistory: (request: ReadSemanticEventHistoryRequest) => Promise<SemanticEventHistory>;
    readNodeDetail: (
      request: ReadSemanticNodeDetailRequest,
    ) => Promise<ReadSemanticNodeDetailResponse>;
    readSteeringState: (
      request: ReadSemanticSteeringStateRequest,
    ) => Promise<SemanticSteeringState>;
    removeEdge: (request: SemanticEdgeOperationRequest) => Promise<SemanticMutationResult>;
    renameNode: (request: RenameSemanticNodeRequest) => Promise<SemanticMutationResult>;
    splitNode: (request: SplitSemanticNodeRequest) => Promise<SemanticMutationResult>;
    updateEdge: (request: UpdateSemanticEdgeRequest) => Promise<SemanticMutationResult>;
    updateLayoutPositions: (
      request: UpdateSemanticLayoutPositionsRequest,
    ) => Promise<SemanticLayoutPositionList>;
    updateNode: (request: UpdateSemanticNodeRequest) => Promise<SemanticMutationResult>;
    updateSteeringDirective: (
      request: UpdateSemanticSteeringDirectiveRequest,
    ) => Promise<SemanticMutationResult>;
  };
  workflow: {
    cancelExecution: (workspaceId: string, executionId: string) => Promise<WorkflowExecution>;
    createDefinition: (
      workspaceId: string,
      name: string,
      description: string,
      graph: WorkflowGraph,
    ) => Promise<WorkflowDefinition>;
    deleteDefinition: (
      workspaceId: string,
      definitionId: string,
    ) => Promise<DeleteWorkflowDefinitionResponse>;
    executionEvents: (
      workspaceId: string,
      executionId: string,
      beforeOrdinal: number,
      limit: number,
    ) => Promise<WorkflowExecutionEventPage>;
    graphProjection: (
      workspaceId: string,
      definitionId?: string,
      versionId?: string,
      executionId?: string,
    ) => Promise<ReadWorkflowGraphProjectionResponse>;
    listDefinitions: (workspaceId: string) => Promise<ListWorkflowDefinitionsResponse>;
    onEvent: (listener: (event: WorkflowEvent) => void) => () => void;
    readDefinition: (workspaceId: string, definitionId: string) => Promise<WorkflowDefinition>;
    readExecution: (workspaceId: string, executionId: string) => Promise<WorkflowExecution>;
    startExecution: (
      workspaceId: string,
      definitionId: string,
      versionId?: string,
    ) => Promise<WorkflowExecution>;
    submitApproval: (request: SubmitWorkflowApprovalRequest) => Promise<WorkflowExecution>;
    updateDefinition: (
      workspaceId: string,
      definitionId: string,
      name: string,
      description: string,
      graph: WorkflowGraph,
    ) => Promise<WorkflowDefinition>;
    validateDefinition: (
      workspaceId: string,
      graph: WorkflowGraph,
    ) => Promise<WorkflowValidationResult>;
  };
}
