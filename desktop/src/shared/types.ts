import type {
  ArchiveTopicConversationRequest,
  AppearancePresetList,
  AppearanceSettings,
  BackendHealth,
  BindTopicConversationFolderRequest,
  CancelCodexLoginRequest,
  CodexAccountChangeEvent,
  CodexAccountState,
  ConversationEvent,
  ConversationSnapshot,
  Artifact,
  ClearDesktopSpeechCredentialRequest,
  CreateSpeechTranscriptionSessionRequest,
  CreateTopicConversationRequest,
  DirectorEvent,
  DirectorIntent,
  DirectorReceipt,
  DirectorSnapshot,
  DisposeSideConversationRequest,
  ListTopicConversationsRequest,
  LogoutCodexAccountRequest,
  DirectorVoiceSelection,
  NarratorVoiceDefault,
  NavigatorPage,
  OpenWorkspaceResponse,
  ReadConversationArtifactRequest,
  ReadConversationSnapshotRequest,
  RefreshCodexAccountRequest,
  ReadConversationRoleConfigurationRequest,
  ReadWorkspaceRoleConfigurationRequest,
  RoleConfiguration,
  RoleModelCatalog,
  RuntimeInfrastructureProvider,
  SendSideConversationTurnRequest,
  SpeechAudio,
  SpeechCapabilities,
  SpeechSynthesisRequest,
  SpeechTranscriptionSession,
  SpeechVoiceCatalog,
  StartCodexLoginRequest,
  StartCodexLoginResponse,
  StopTopicConversationTurnRequest,
  SubmitTopicConversationApprovalRequest,
  UpdateAppearanceSettingsRequest,
  UpdateConversationRoleProfilesRequest,
  UpdateGlobalRoleProfilesRequest,
  UpdateWorkspaceRoleProfilesRequest,
  VoiceSelectionRequest,
  WorkspaceSession,
} from "@generated/backend";
import type {
  ConversationEventReleaseRequest,
  ConversationEventSubscriptionRequest,
} from "./conversation-ipc";
import type { DirectorEventSubscriptionRequest } from "./director-ipc";
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
    disposeSide?: (request: DisposeSideConversationRequest) => Promise<ConversationSnapshot>;
    list: (request: ListTopicConversationsRequest) => Promise<NavigatorPage>;
    onEvent: (listener: (event: ConversationEvent) => void) => () => void;
    read: (request: ReadConversationSnapshotRequest) => Promise<ConversationSnapshot>;
    readArtifact?: (request: ReadConversationArtifactRequest) => Promise<Artifact>;
    release: (request: ConversationEventReleaseRequest) => Promise<void>;
    sendSide?: (request: SendSideConversationTurnRequest) => Promise<ConversationSnapshot>;
    stop: (request: StopTopicConversationTurnRequest) => Promise<ConversationSnapshot>;
    submitApproval: (
      request: SubmitTopicConversationApprovalRequest,
    ) => Promise<ConversationSnapshot>;
    subscribe: (request: ConversationEventSubscriptionRequest) => Promise<void>;
  };
  director: {
    dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
    onEvent: (listener: (event: DirectorEvent) => void) => () => void;
    readSnapshot: () => Promise<DirectorSnapshot>;
    subscribe: (request: DirectorEventSubscriptionRequest) => Promise<void>;
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
    readDirectorVoiceSelection?: () => Promise<DirectorVoiceSelection>;
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
    updateDirectorVoiceSelection?: (
      request: VoiceSelectionRequest,
    ) => Promise<DirectorVoiceSelection>;
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
  workspace: {
    close: (id: string) => Promise<WorkspaceSession>;
    openLocalFolder: () => Promise<OpenWorkspaceResponse | null>;
    openPath: (rootPath: string) => Promise<OpenWorkspaceResponse>;
    relocateLocalFolder: (id: string) => Promise<OpenWorkspaceResponse | null>;
    refreshAvailability: (id: string) => Promise<WorkspaceSession>;
    removeRecent: (id: string) => Promise<WorkspaceSession>;
    reorder: (ids: string[]) => Promise<WorkspaceSession>;
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
