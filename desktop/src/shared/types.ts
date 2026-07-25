import type {
  AcceptedConversationInput,
  AcceptedMasterInput,
  ActiveShellInteraction,
  ArchiveTopicConversationRequest,
  AppearanceMasterVoiceShortcut,
  AppearancePresetList,
  AppearanceSettings,
  AppPaneLayout,
  AppPaneLayoutReadResult,
  BackendHealth,
  BindTopicConversationFolderRequest,
  CancelMasterInputRequest,
  CancelCodexLoginRequest,
  CodexAccountChangeEvent,
  CodexAccountState,
  ConversationEvent,
  ConversationInputRoutingState,
  ConversationPresentationProfile,
  ConversationSnapshot,
  Artifact,
  ClearDesktopSpeechCredentialRequest,
  CreateSpeechTranscriptionSessionRequest,
  CreateTopicConversationRequest,
  DiscardConversationInputRequest,
  DisposeSideConversationRequest,
  ListTopicConversationsRequest,
  LogoutCodexAccountRequest,
  MasterVoiceSelection,
  NarratorVoiceDefault,
  NavigatorPage,
  OpenWorkspaceResponse,
  PresentationIntent,
  PresentationResolution,
  PresentationResolutionRequest,
  ReadConversationInputRoutingStateRequest,
  ReadConversationArtifactRequest,
  ReadConversationSnapshotRequest,
  ReadMasterInputRoutingStateRequest,
  ReadMasterTranscriptRequest,
  RefreshCodexAccountRequest,
  ReadConversationRoleConfigurationRequest,
  ReadWorkspaceRoleConfigurationRequest,
  RetryConversationInputRequest,
  RoleConfiguration,
  RoleModelCatalog,
  RuntimeInfrastructureProvider,
  SendSideConversationTurnRequest,
  ShellInteractionState,
  SpeechAudio,
  SpeechCapabilities,
  SpeechSynthesisRequest,
  SpeechTranscriptionSession,
  SpeechVoiceCatalog,
  StartCodexLoginRequest,
  StartCodexLoginResponse,
  StopTopicConversationTurnRequest,
  SubmitConversationInputRequest,
  SubmitMasterInputRequest,
  SubmitTopicConversationApprovalRequest,
  Transcript,
  UpdateAppearanceSettingsRequest,
  UpdateConversationRoleProfilesRequest,
  UpdateGlobalRoleProfilesRequest,
  UpdateWorkspaceRoleProfilesRequest,
  UpdateTopicConversationPresentationRequest,
  VoiceSelectionRequest,
  WorkspaceUILayout,
  WorkspaceUILayoutReadResult,
  WorkspaceSession,
} from "@generated/backend";
import type {
  ConversationEventReleaseRequest,
  ConversationEventSubscriptionRequest,
} from "./conversation-ipc";
import type {
  LocalMacOSVoiceCancelCaptureResult,
  LocalMacOSVoiceFinishCaptureResult,
  SpeechCredentialProviderRequest,
  SpeechCredentialSaveRequest,
  SpeechCredentialSettings,
  LocalMacOSVoiceModelDownloadStatus,
  SpeechProviderSelectionSettings,
  SpeechProviderSelectionUpdateRequest,
  LocalMacOSVoiceHealth,
  LocalMacOSVoiceSessionRequest,
  LocalMacOSVoiceStartCaptureRequest,
  LocalMacOSVoiceStartCaptureResult,
} from "./speech-ipc";

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
  masterVoiceShortcut: AppearanceMasterVoiceShortcut;
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

export interface SettaAPI {
  app: {
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
    onProcessStatus: (listener: (status: BackendProcessStatus) => void) => () => void;
  };
  appLayout: {
    readPaneLayout: () => Promise<AppPaneLayoutReadResult>;
    savePaneLayout: (layout: AppPaneLayout) => Promise<AppPaneLayout>;
  };
  runtimes: {
    addByPairingUrl: (pairingUrl: string) => Promise<RuntimeRegistrySnapshot>;
    current: () => Promise<RuntimeRegistrySnapshot>;
    list: () => Promise<KnownRuntimeView[]>;
    onConnectionState: (listener: (snapshot: RuntimeRegistrySnapshot) => void) => () => void;
    remove: (runtimeId: string) => Promise<RuntimeRegistrySnapshot>;
    switch: (runtimeId: string) => Promise<RuntimeRegistrySnapshot>;
  };
  conversations: {
    archive: (request: ArchiveTopicConversationRequest) => Promise<ConversationSnapshot>;
    bindFolder: (request: BindTopicConversationFolderRequest) => Promise<ConversationSnapshot>;
    create: (request: CreateTopicConversationRequest) => Promise<ConversationSnapshot>;
    discardInput?: (
      request: DiscardConversationInputRequest,
    ) => Promise<ConversationInputRoutingState>;
    disposeSide?: (request: DisposeSideConversationRequest) => Promise<ConversationSnapshot>;
    list: (request: ListTopicConversationsRequest) => Promise<NavigatorPage>;
    onEvent: (listener: (event: ConversationEvent) => void) => () => void;
    read: (request: ReadConversationSnapshotRequest) => Promise<ConversationSnapshot>;
    readArtifact?: (request: ReadConversationArtifactRequest) => Promise<Artifact>;
    readInputState?: (
      request: ReadConversationInputRoutingStateRequest,
    ) => Promise<ConversationInputRoutingState>;
    release: (request: ConversationEventReleaseRequest) => Promise<void>;
    retryInput?: (request: RetryConversationInputRequest) => Promise<ConversationInputRoutingState>;
    sendSide?: (request: SendSideConversationTurnRequest) => Promise<ConversationSnapshot>;
    stop: (request: StopTopicConversationTurnRequest) => Promise<ConversationSnapshot>;
    submitApproval: (
      request: SubmitTopicConversationApprovalRequest,
    ) => Promise<ConversationSnapshot>;
    submitInput?: (request: SubmitConversationInputRequest) => Promise<AcceptedConversationInput>;
    subscribe: (request: ConversationEventSubscriptionRequest) => Promise<void>;
    updatePresentation: (
      request: UpdateTopicConversationPresentationRequest,
    ) => Promise<ConversationPresentationProfile>;
    waitInputState?: (
      request: ReadConversationInputRoutingStateRequest,
    ) => Promise<ConversationInputRoutingState>;
  };
  master?: {
    cancelInput: (request: CancelMasterInputRequest) => Promise<ShellInteractionState>;
    readActiveInteraction: () => Promise<ActiveShellInteraction>;
    readTranscript: (request: ReadMasterTranscriptRequest) => Promise<Transcript>;
    resolvePresentation: (
      request: PresentationResolutionRequest,
    ) => Promise<PresentationResolution>;
    submitInput: (request: SubmitMasterInputRequest) => Promise<AcceptedMasterInput>;
    waitInteraction: (
      request: ReadMasterInputRoutingStateRequest,
    ) => Promise<ShellInteractionState>;
    waitPresentation: (request: ReadMasterInputRoutingStateRequest) => Promise<PresentationIntent>;
  };
  roles?: {
    readConversation: (
      request: ReadConversationRoleConfigurationRequest,
    ) => Promise<RoleConfiguration>;
    readGlobal: () => Promise<RoleConfiguration>;
    readModels: () => Promise<RoleModelCatalog>;
    readWorkspace: (request: ReadWorkspaceRoleConfigurationRequest) => Promise<RoleConfiguration>;
    updateConversation: (
      request: UpdateConversationRoleProfilesRequest,
    ) => Promise<RoleConfiguration>;
    updateGlobal: (request: UpdateGlobalRoleProfilesRequest) => Promise<RoleConfiguration>;
    updateWorkspace: (request: UpdateWorkspaceRoleProfilesRequest) => Promise<RoleConfiguration>;
  };
  speech: {
    cancelSynthesis?: (operationId: string) => Promise<void>;
    cancelLocalMacOSVoiceCapture?: (
      request: LocalMacOSVoiceSessionRequest,
    ) => Promise<LocalMacOSVoiceCancelCaptureResult>;
    createTranscriptionSession: (
      request: CreateSpeechTranscriptionSessionRequest,
    ) => Promise<SpeechTranscriptionSession>;
    finishLocalMacOSVoiceCapture?: (
      request: LocalMacOSVoiceSessionRequest,
    ) => Promise<LocalMacOSVoiceFinishCaptureResult>;
    onCredentialSettingsChanged?: (
      listener: (settings: SpeechCredentialSettings) => void,
    ) => () => void;
    onProviderSelectionChanged?: (
      listener: (settings: SpeechProviderSelectionSettings) => void,
    ) => () => void;
    onLocalMacOSVoiceModelDownloadChanged?: (
      listener: (status: LocalMacOSVoiceModelDownloadStatus) => void,
    ) => () => void;
    readCapabilities: () => Promise<SpeechCapabilities>;
    readCredentialSettings?: (
      request: SpeechCredentialProviderRequest,
    ) => Promise<SpeechCredentialSettings>;
    readLocalMacOSVoiceHealth?: () => Promise<LocalMacOSVoiceHealth>;
    readLocalMacOSVoiceModelDownload?: () => Promise<LocalMacOSVoiceModelDownloadStatus>;
    listLocalMacOSVoices?: () => Promise<SpeechVoiceCatalog>;
    readMasterVoiceSelection?: () => Promise<MasterVoiceSelection>;
    readNarratorVoiceDefault?: () => Promise<NarratorVoiceDefault>;
    readProviderSelection?: () => Promise<SpeechProviderSelectionSettings>;
    removeCredential?: (
      request: ClearDesktopSpeechCredentialRequest,
    ) => Promise<SpeechCredentialSettings>;
    saveCredential?: (request: SpeechCredentialSaveRequest) => Promise<SpeechCredentialSettings>;
    startLocalMacOSVoiceCapture?: (
      request: LocalMacOSVoiceStartCaptureRequest,
    ) => Promise<LocalMacOSVoiceStartCaptureResult>;
    startLocalMacOSVoiceModelDownload?: () => Promise<LocalMacOSVoiceModelDownloadStatus>;
    synthesize?: (request: SpeechSynthesisRequest, operationId: string) => Promise<SpeechAudio>;
    updateMasterVoiceSelection?: (request: VoiceSelectionRequest) => Promise<MasterVoiceSelection>;
    updateNarratorVoiceDefault?: (request: VoiceSelectionRequest) => Promise<NarratorVoiceDefault>;
    updateProviderSelection?: (
      request: SpeechProviderSelectionUpdateRequest,
    ) => Promise<SpeechProviderSelectionSettings>;
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
  workspace: {
    close: (id: string) => Promise<WorkspaceSession>;
    openLocalFolder: () => Promise<OpenWorkspaceResponse | null>;
    openPath: (rootPath: string) => Promise<OpenWorkspaceResponse>;
    relocateLocalFolder: (id: string) => Promise<OpenWorkspaceResponse | null>;
    readUILayout: (workspaceId: string) => Promise<WorkspaceUILayoutReadResult>;
    refreshAvailability: (id: string) => Promise<WorkspaceSession>;
    removeRecent: (id: string) => Promise<WorkspaceSession>;
    reorder: (ids: string[]) => Promise<WorkspaceSession>;
    saveUILayout: (layout: WorkspaceUILayout) => Promise<WorkspaceUILayout>;
    select: (id: string) => Promise<WorkspaceSession>;
    session: () => Promise<WorkspaceSession>;
  };
  codexAccount: {
    cancelLogin: (request: CancelCodexLoginRequest) => Promise<CodexAccountState>;
    logout: (request: LogoutCodexAccountRequest) => Promise<CodexAccountState>;
    onChanged: (listener: (event: CodexAccountChangeEvent) => void) => () => void;
    read: () => Promise<CodexAccountState>;
    refresh: (request: RefreshCodexAccountRequest) => Promise<CodexAccountState>;
    startLogin: (request: StartCodexLoginRequest) => Promise<StartCodexLoginResponse>;
  };
}
