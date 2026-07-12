import type {
  AcceptedConversationInput,
  AcceptedMasterInput,
  AppearancePresetList,
  AppearanceSettings,
  AttachSemanticNodeToChatMessageRequest,
  AttachSemanticNodeToChatRunRequest,
  AttachSemanticNodeToFileRangeRequest,
  AttachSemanticNodeToRunItemRequest,
  AttachSemanticNodeToWorkflowExecutionRequest,
  AttachSemanticNodeToWorkflowNodeRequest,
  BackendHealth,
  BackgroundTerminalListProjection,
  BackgroundTerminalOutputPage,
  BackgroundTerminalProcess,
  BuildCartographerWindowRequest,
  CancelCodexLoginRequest,
  CartographerCursorList,
  CartographerPatchList,
  CartographerPatchReviewResult,
  CartographerProcessingState,
  CartographerRunList,
  CartographerRunReadResponse,
  CartographerWindowBuildResult,
  CartographerWindowList,
  CartographerWindowProcessResult,
  ChatCommandExecuteResult,
  ChatCommandListResult,
  ChatCodexDefaultsView,
  ChatEvent,
  ChatInput,
  ChatPermissionPresetID,
  CodexAccountState,
  ComposerPromptHistoryPage,
  Conversation,
  ConversationEvent,
  ConversationInputRoutingState,
  ConversationPresentationProfile,
  ConversationSnapshot,
  ConversationListItem,
  DiscardConversationInputRequest,
  DisposeSideConversationRequest,
  CreateTopicConversationRequest,
  SendSideConversationTurnRequest,
  CreateSemanticEdgeRequest,
  CreateSemanticNodeRequest,
  CreateSemanticSteeringDirectiveRequest,
  CloseTerminalRequest,
  CloseTerminalResponse,
  CreateTerminalProfileRequest,
  DeleteTerminalProfileRequest,
  DeleteWorkflowDefinitionResponse,
  EndSemanticActivityRequest,
  GetActiveRunResponse,
  ImmediateSteeringResult,
  ImageAttachment,
  ListCartographerCursorsRequest,
  ListCartographerPatchesRequest,
  ListCartographerRunsRequest,
  ListCartographerWindowsRequest,
  ListConversationsResponse,
  ListTopicConversationsRequest,
  ListWorkflowExecutionsResponse,
  ListSemanticContextPacksRequest,
  ListWorkflowDefinitionsResponse,
  LogoutCodexAccountRequest,
  MergeSemanticNodesRequest,
  MasterVoiceSelection,
  ActiveShellInteraction,
  MessagePage,
  OpenWorkspaceResponse,
  NavigatorPage,
  ProcessCartographerWindowRequest,
  PresentationIntent,
  PresentationResolution,
  PresentationResolutionRequest,
  QueueEditResult,
  QueueMessageResult,
  QueueRemoveResult,
  ReadCartographerProcessingStateRequest,
  ReconcileChatRunsRequest,
  ReconcileChatRunsResponse,
  RenameSemanticNodeRequest,
  ReadCartographerRunRequest,
  ReadConversationInputRoutingStateRequest,
  ReadConversationSnapshotRequest,
  ReadMasterInputRoutingStateRequest,
  ShellInteractionState,
  ReadSemanticActivitySummaryRequest,
  ReadSemanticContextPackRequest,
  ReadSemanticEventHistoryRequest,
  ReadSemanticGraphRequest,
  ReadSemanticNodeDetailRequest,
  ReadSemanticNodeDetailResponse,
  ReadSemanticSteeringStateRequest,
  ReadWorkflowGraphProjectionResponse,
  ReadWorkflowNodeTrajectoryRequest,
  ReasoningEffort,
  RefreshCodexAccountRequest,
  RetryWorkflowNodeRunLivenessRequest,
  RetryConversationInputRequest,
  ResizeTerminalRequest,
  ReviewCartographerPatchRequest,
  Run,
  RunActivityPage,
  RunLivenessReconciliationResult,
  RunItemOutputPage,
  RuntimeInfrastructureProvider,
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
  SemanticGraphChangeEvent,
  SemanticLayoutPositionList,
  SemanticMutationResult,
  SemanticNodeOperationRequest,
  SemanticSteeringState,
  SendMessageResult,
  SelectDefaultTerminalProfileRequest,
  SpeechCapabilities,
  SpeechAudio,
  SpeechSynthesisRequest,
  SpeechTranscriptionSession,
  StartCodexLoginRequest,
  StartCodexLoginResponse,
  SteerMessageResult,
  SteerWorkflowNodeRunRequest,
  SplitSemanticNodeRequest,
  SubmitApprovalRequest,
  StopTopicConversationTurnRequest,
  SubmitConversationInputRequest,
  SubmitTopicConversationApprovalRequest,
  StopWorkflowNodeRunRequest,
  SubmitMasterInputRequest,
  SubmitWorkflowApprovalRequest,
  TerminalEvent,
  TerminalInputRequest,
  TerminalInputResponse,
  TerminalProfileList,
  TerminalSessionResponse,
  UpdateAppearanceSettingsRequest,
  UpdateChatCodexDefaultsRequest,
  UpdateSemanticEdgeRequest,
  UpdateSemanticLayoutPositionsRequest,
  UpdateSemanticNodeRequest,
  UpdateSemanticSteeringDirectiveRequest,
  UpdateTerminalProfileRequest,
  UpdateTopicConversationNarratorVoiceRequest,
  VoiceSelectionRequest,
  WorkflowAgentTrajectoryPage,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowExecution,
  WorkflowExecutionEventPage,
  WorkflowGraph,
  WorkflowValidationResult,
  WorkspaceActivityEvent,
  WorkspaceActivitySnapshot,
  WorkspaceSelectedConversations,
  WorkspaceUILayout,
  WorkspaceUILayoutReadResult,
  WorkspaceSession,
} from "@generated/backend";
import type {
  ConversationEventReleaseRequest,
  ConversationEventSubscriptionRequest,
} from "./conversation-ipc";

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

export interface RendererRegionCaptureRequest {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface RendererRegionSnapshot {
  capturedAt: number;
  height: number;
  imageDataUrl: string;
  width: number;
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

export const workspaceBrowserViewKeyValues = [
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "Delete",
  "Enter",
  "b",
  "c",
  "g",
  "k",
  "n",
  "o",
  "s",
  "t",
  "v",
] as const;

export type WorkspaceBrowserViewKey = (typeof workspaceBrowserViewKeyValues)[number];

export interface WorkspaceBrowserViewKeyEvent {
  altKey: boolean;
  ctrlKey: boolean;
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

export type RuntimeConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "unreachable"
  | "revoked"
  | "incompatible"
  | "mismatched";

export interface RuntimeConnectionState {
  message: string;
  protocolVersion: number | null;
  runtimeId: string | null;
  status: RuntimeConnectionStatus;
  updatedAt: string;
}

export interface KnownRuntimeView {
  active: boolean;
  baseUrl: string;
  connectionMessage: string;
  connectionStatus: RuntimeConnectionStatus;
  displayName: string;
  infrastructureProvider: RuntimeInfrastructureProvider;
  isLocal: boolean;
  lastConnected: string | null;
  runtimeId: string;
}

export interface RuntimeRegistrySnapshot {
  activeRuntimeId: string | null;
  connection: RuntimeConnectionState;
  runtimes: KnownRuntimeView[];
  switching: boolean;
}

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
    captureRendererRegion: (
      request: RendererRegionCaptureRequest,
    ) => Promise<RendererRegionSnapshot>;
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
  runtimes: {
    addByPairingUrl: (pairingUrl: string) => Promise<RuntimeRegistrySnapshot>;
    current: () => Promise<RuntimeRegistrySnapshot>;
    list: () => Promise<KnownRuntimeView[]>;
    onConnectionState: (listener: (snapshot: RuntimeRegistrySnapshot) => void) => () => void;
    remove: (runtimeId: string) => Promise<RuntimeRegistrySnapshot>;
    switch: (runtimeId: string) => Promise<RuntimeRegistrySnapshot>;
  };
  workspaceActivity: {
    onEvent: (listener: (event: WorkspaceActivityEvent) => void) => () => void;
    snapshot: (workspaceId: string, limit: number) => Promise<WorkspaceActivitySnapshot>;
    executionSnapshot: (
      workspaceId: string,
      executionId: string,
      limit: number,
    ) => Promise<WorkspaceActivitySnapshot>;
  };
  conversations: {
    discardInput?: (
      request: DiscardConversationInputRequest,
    ) => Promise<ConversationInputRoutingState>;
    disposeSide?: (request: DisposeSideConversationRequest) => Promise<ConversationSnapshot>;
    create: (request: CreateTopicConversationRequest) => Promise<ConversationSnapshot>;
    list: (request: ListTopicConversationsRequest) => Promise<NavigatorPage>;
    onEvent: (listener: (event: ConversationEvent) => void) => () => void;
    readInputState?: (
      request: ReadConversationInputRoutingStateRequest,
    ) => Promise<ConversationInputRoutingState>;
    waitInputState?: (
      request: ReadConversationInputRoutingStateRequest,
    ) => Promise<ConversationInputRoutingState>;
    read: (request: ReadConversationSnapshotRequest) => Promise<ConversationSnapshot>;
    release: (request: ConversationEventReleaseRequest) => Promise<void>;
    retryInput?: (request: RetryConversationInputRequest) => Promise<ConversationInputRoutingState>;
    sendSide?: (request: SendSideConversationTurnRequest) => Promise<ConversationSnapshot>;
    stop: (request: StopTopicConversationTurnRequest) => Promise<ConversationSnapshot>;
    submitInput?: (request: SubmitConversationInputRequest) => Promise<AcceptedConversationInput>;
    submitApproval: (
      request: SubmitTopicConversationApprovalRequest,
    ) => Promise<ConversationSnapshot>;
    subscribe: (request: ConversationEventSubscriptionRequest) => Promise<void>;
    updateNarratorVoice?: (
      request: UpdateTopicConversationNarratorVoiceRequest,
    ) => Promise<ConversationPresentationProfile>;
  };
  master?: {
    readActiveInteraction: () => Promise<ActiveShellInteraction>;
    resolvePresentation: (
      request: PresentationResolutionRequest,
    ) => Promise<PresentationResolution>;
    submitInput: (request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>;
    waitInteraction: (
      request: ReadMasterInputRoutingStateRequest,
    ) => Promise<ShellInteractionState>;
    waitPresentation: (request: ReadMasterInputRoutingStateRequest) => Promise<PresentationIntent>;
  };
  speech: {
    cancelSynthesis?: (operationId: string) => Promise<void>;
    createTranscriptionSession: () => Promise<SpeechTranscriptionSession>;
    readCapabilities: () => Promise<SpeechCapabilities>;
    readMasterVoiceSelection?: () => Promise<MasterVoiceSelection>;
    synthesize?: (request: SpeechSynthesisRequest, operationId: string) => Promise<SpeechAudio>;
    updateMasterVoiceSelection?: (request: VoiceSelectionRequest) => Promise<MasterVoiceSelection>;
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
    close: (request: CloseTerminalRequest) => Promise<CloseTerminalResponse>;
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
    readUILayout: (workspaceId: string) => Promise<WorkspaceUILayoutReadResult>;
    removeRecent: (id: string) => Promise<WorkspaceSession>;
    reorder: (ids: string[]) => Promise<WorkspaceSession>;
    saveUILayout: (layout: WorkspaceUILayout) => Promise<WorkspaceUILayout>;
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
    reconcileRuns: (request: ReconcileChatRunsRequest) => Promise<ReconcileChatRunsResponse>;
    createConversation: (workspaceId: string, title: string) => Promise<Conversation>;
    deleteConversation: (
      workspaceId: string,
      conversationId: string,
    ) => Promise<ListConversationsResponse>;
    editQueuedMessage: (
      workspaceId: string,
      conversationId: string,
      messageId: string,
      input: ChatInput,
    ) => Promise<QueueEditResult>;
    createImageAttachmentFromBytes: (
      workspaceId: string,
      conversationId: string,
      fileName: string,
      dataBase64: string,
    ) => Promise<ImageAttachment>;
    selectImageAttachments: (
      workspaceId: string,
      conversationId: string,
      maxCount: number,
    ) => Promise<ImageAttachment[]>;
    executeCommand: (
      workspaceId: string,
      conversationId: string,
      raw: string,
      options?: ChatCommandExecutionOptions,
    ) => Promise<ChatCommandExecuteResult>;
    readCodexDefaults: () => Promise<ChatCodexDefaultsView>;
    openCodexModelPicker: (
      workspaceId: string,
      conversationId: string,
    ) => Promise<ChatCommandExecuteResult>;
    openCodexPermissionPicker: (
      workspaceId: string,
      conversationId: string,
    ) => Promise<ChatCommandExecuteResult>;
    setCodexModel: (
      workspaceId: string,
      conversationId: string,
      modelId: string,
    ) => Promise<ChatCommandExecuteResult>;
    setCodexPermissionPreset: (
      workspaceId: string,
      conversationId: string,
      preset: ChatPermissionPresetID,
      confirmed: boolean,
    ) => Promise<ChatCommandExecuteResult>;
    setCodexReasoningEffort: (
      workspaceId: string,
      conversationId: string,
      effort: ReasoningEffort,
    ) => Promise<ChatCommandExecuteResult>;
    updateCodexDefaults: (
      request: UpdateChatCodexDefaultsRequest,
    ) => Promise<ChatCodexDefaultsView>;
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
      beforeBlockOrdinal: number,
      limit: number,
    ) => Promise<MessagePage>;
    listComposerPromptHistory: (
      workspaceId: string,
      conversationId: string,
      beforeOrdinal: number,
      limit: number,
    ) => Promise<ComposerPromptHistoryPage>;
    queueMessage: (
      workspaceId: string,
      conversationId: string,
      input: ChatInput,
    ) => Promise<QueueMessageResult>;
    removeQueuedMessage: (
      workspaceId: string,
      conversationId: string,
      messageId: string,
    ) => Promise<QueueRemoveResult>;
    runActivity: (
      workspaceId: string,
      runId: string,
      afterItemId: string,
      limit: number,
    ) => Promise<RunActivityPage>;
    runItemOutput: (
      workspaceId: string,
      runId: string,
      runItemId: string,
      afterOrdinal: number,
      limit: number,
    ) => Promise<RunItemOutputPage>;
    listBackgroundTerminals: (
      workspaceId: string,
      conversationId: string,
    ) => Promise<BackgroundTerminalListProjection>;
    getBackgroundTerminalOutput: (
      workspaceId: string,
      conversationId: string,
      processId: string,
      afterOrdinal: number,
      limit: number,
    ) => Promise<BackgroundTerminalOutputPage>;
    killBackgroundTerminal: (
      workspaceId: string,
      conversationId: string,
      processId: string,
    ) => Promise<BackgroundTerminalProcess>;
    killAllBackgroundTerminals: (
      workspaceId: string,
      conversationId: string,
    ) => Promise<BackgroundTerminalListProjection>;
    sendMessage: (
      workspaceId: string,
      conversationId: string,
      input: ChatInput,
    ) => Promise<SendMessageResult>;
    sendSteeringImmediately: (
      workspaceId: string,
      conversationId: string,
      input?: ChatInput,
    ) => Promise<ImmediateSteeringResult>;
    steerMessage: (
      workspaceId: string,
      conversationId: string,
      input: ChatInput,
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
    processCartographerWindow: (
      request: ProcessCartographerWindowRequest,
    ) => Promise<CartographerWindowProcessResult>;
    readCartographerProcessingState: (
      request: ReadCartographerProcessingStateRequest,
    ) => Promise<CartographerProcessingState>;
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
    onEvent: (listener: (event: SemanticGraphChangeEvent) => void) => () => void;
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
    listExecutions: (
      workspaceId: string,
      definitionId: string,
      limit: number,
    ) => Promise<ListWorkflowExecutionsResponse>;
    onEvent: (listener: (event: WorkflowEvent) => void) => () => void;
    readDefinition: (workspaceId: string, definitionId: string) => Promise<WorkflowDefinition>;
    readExecution: (workspaceId: string, executionId: string) => Promise<WorkflowExecution>;
    readNodeTrajectory: (
      request: ReadWorkflowNodeTrajectoryRequest,
    ) => Promise<WorkflowAgentTrajectoryPage>;
    retryNodeRunLiveness: (
      request: RetryWorkflowNodeRunLivenessRequest,
    ) => Promise<RunLivenessReconciliationResult>;
    startExecution: (
      workspaceId: string,
      definitionId: string,
      versionId?: string,
    ) => Promise<WorkflowExecution>;
    steerNodeRun: (request: SteerWorkflowNodeRunRequest) => Promise<SteerMessageResult>;
    stopNodeRun: (request: StopWorkflowNodeRunRequest) => Promise<WorkflowExecution>;
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
