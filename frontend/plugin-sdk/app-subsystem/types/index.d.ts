export type JsonRecord = Record<string, any>;

export type RunSnapshotMode = "ephemeral" | "always" | "never";
export type Policy = JsonRecord;
export type Core = JsonRecord;
export type Variant = JsonRecord;
export type ContentRef = JsonRecord & {
  contentId: string;
  mimeType?: string;
};
export type ImageArtifact = JsonRecord & {
  id: string;
  value: ContentRef;
};
export type ObjectValues = Record<string, unknown>;
export type BaseDependencyKeyUnion = unknown;
export type BaseDependencyValueUnion = unknown;
export type BaseChildlessCodeObjImplUnion = JsonRecord;
export type BaseSectionImplUnion = JsonRecord;
export type LiteralDependencyValue = JsonRecord;
export type DateParamCodeObjImpl = JsonRecord;
export type TimeParamCodeObjImpl = JsonRecord;

export type ProjectConfig = JsonRecord & {
  id: string;
  name?: string;
  entryCodeBlockId?: string | null;
  sectionVariantMap?: Record<string, string>;
};
export type SingleConfig = JsonRecord & {
  projectConfig: ProjectConfig;
  sections: Record<string, Core>;
  sectionVariants: Record<string, Variant>;
  sectionImpls: Record<string, JsonRecord>;
  sectionCapabilities: Record<string, JsonRecord>;
  codeObjs: Record<string, Core>;
  codeObjVariants: Record<string, Variant>;
  codeObjImpls: Record<string, JsonRecord>;
  artifactGroups: Record<string, unknown>;
  singletonSections: JsonRecord;
  parentSectionMap: Record<string, string | null>;
  shownParamIds: Record<string, unknown>;
  previewSectionVariantMap: Record<string, string>;
  requiredDecodedImages: unknown[];
  genCodeBinding: unknown | null;
};

export type AppsubsystemAppdefinitionAppDefinition = JsonRecord;
export type HttpapiDeploymentMetadataResponse = JsonRecord;
export type HttpapiPublishAppDeploymentRequest = JsonRecord;
export type HttpapiServerModeResponse = JsonRecord & {
  mode: string | null;
};

export type GetLatestProjectStateResponse = {
  projectState: SingleConfig;
};
export type GetAppDeploymentCurrentSessionResponses = {
  200: AppSubsystemDeploymentSession;
};
export type GetAppDeploymentStateResponses = {
  200: {
    projectState: SingleConfig;
    appDefinition?: AppsubsystemAppdefinitionAppDefinition | null;
    appSpec?: unknown | null;
    appPolicy?: Policy | null;
  };
};

export type ResponseDataAndStatus<T = unknown> = {
  data: T | undefined;
  status: number | undefined;
  hasResponse: boolean;
};

export declare const CodeObjTypeEnum: Readonly<Record<string, string>>;
export declare const ConfigLanguageEnum: Readonly<Record<string, string>>;
export declare const DateCalendarWeekStartEnum: Readonly<Record<string, string>>;
export declare const DateControlModeEnum: Readonly<Record<string, string>>;
export declare const DateDisplayFormatEnum: Readonly<Record<string, string>>;
export declare const DateSelectionModeEnum: Readonly<Record<string, string>>;
export declare const DependencyKeyTypeEnum: Readonly<Record<string, string>>;
export declare const DependencyValueTypeEnum: Readonly<Record<string, string>>;
export declare const DropzoneModeEnum: Readonly<Record<string, string>>;
export declare const ArtifactTypeEnum: Readonly<Record<string, string>>;
export declare const SectionTypeEnum: Readonly<Record<string, string>>;
export declare const TextBlockFormatEnum: Readonly<Record<string, string>>;
export declare const TextParamInputUITypeEnum: Readonly<Record<string, string>>;
export declare const TimeControlModeEnum: Readonly<Record<string, string>>;
export declare const TimeDisplayFontEnum: Readonly<Record<string, string>>;
export declare const TimeDisplayFormatEnum: Readonly<Record<string, string>>;
export declare const DefaultAppPolicy: Policy;
export declare const RunSnapshotModeUIConfig: JsonRecord;
export declare const AppGenerationModeEnum: Readonly<Record<string, string>>;
export declare const AppSpecPatchPolicyConfig: {
  allowedOps: string[];
  commentPrefix: string;
  elementsPathPrefix: string;
  rootPath: string;
  rootResetValue: string;
  valueOptionalOps: string[];
};
export declare const AppSubsystemChatUIConfig: {
  customSlashCommandModeOptions: Array<{
    label: string;
    requiresImageAttachment: boolean;
    value: string;
  }>;
  defaultCustomSlashCommandMode: string;
  slashCommands: Array<{
    action: string;
    appGenerationMode: string;
    command: string;
    promptTemplate: string;
    summary: string;
  }>;
};

export declare function createSettingsState(overrides?: JsonRecord): JsonRecord;
export declare function createSingleConfig(overrides?: Partial<SingleConfig>): SingleConfig;
export declare function createPolicy(overrides?: Policy): Policy;
export declare function createProjectConfig(overrides?: Partial<ProjectConfig>): ProjectConfig;
export declare function createSectionCapabilities(overrides?: JsonRecord): JsonRecord;
export declare function createSingletonSections(overrides?: JsonRecord): JsonRecord;
export declare function createCore(overrides?: JsonRecord): Core;
export declare function createVariant(overrides?: JsonRecord): Variant;
export declare function createCallableSectionImpl(overrides?: JsonRecord): JsonRecord;
export declare function createCodeParamCodeObjImpl(overrides?: JsonRecord): JsonRecord;
export declare function createTextBlockSectionImpl(overrides?: JsonRecord): JsonRecord;
export declare function createContentRef(overrides?: Partial<ContentRef>): ContentRef;
export declare function createImageArtifact(overrides?: Partial<ImageArtifact>): ImageArtifact;
export declare function isBaseParamCodeObjImpl(value: unknown): value is JsonRecord;
export declare function isBaseChildlessCodeObjImpl(value: unknown): value is JsonRecord;
export declare function isBaseSectionWithParamsImpl(value: unknown): value is JsonRecord;
export declare function createDefaultAppPolicy(): Policy;
export declare function resolveAppPolicy(policy?: Policy | null): Policy;
export declare function resolveMainRunRequest(args: JsonRecord): JsonRecord;
export declare function resolveRunRequest(args: JsonRecord): JsonRecord;

export declare const CODEMIRROR_TOOLTIP_PARENT_ID: string;
export declare const NO_PAN_CLASS_NAME: string;
export declare const SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION: string;
export declare const SETTA_PREVENT_SECTION_ACTIVE_CSS: string;
export declare function shouldShowPasswordReveal(args: JsonRecord): boolean;
export declare function buildTextBlockTypographyScale(masterFontSizePx: number): JsonRecord;
export declare function createRandomName(): string;
export type DropzoneStoredAttachment = JsonRecord;
export type DropzoneStatelessAttachment = JsonRecord;
export declare function createDropzoneFileArtifactId(id: string): string;
export declare function createDropzoneTextAttachmentId(id: string): string;
export declare function parseDropzoneValue(value: unknown): unknown;
export declare function serializeDropzoneValue(value: unknown): unknown;
export declare function formatBytes(value: number): string;
export declare function getAttachmentPolicy(args?: JsonRecord): JsonRecord;
export declare function isAttachmentMimeAllowed(args: JsonRecord): boolean;

export declare function checkIfFileExists(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function deleteArtifacts(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function downloadBinary(options?: unknown): Promise<ResponseDataAndStatus<Blob>>;
export declare function getAppDefinition(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function getAppDeploymentCurrentSession(options?: unknown): Promise<ResponseDataAndStatus<GetAppDeploymentCurrentSessionResponses[200]>>;
export declare function getAppDeploymentProjectConfig(options?: unknown): Promise<ResponseDataAndStatus<GetAppDeploymentStateResponses[200]>>;
export declare function getAppDeploymentState(options?: unknown): Promise<ResponseDataAndStatus<GetAppDeploymentStateResponses[200]>>;
export declare function getAttachmentDownloadUrl(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function getLatestProjectState(options?: unknown): Promise<ResponseDataAndStatus<GetLatestProjectStateResponse>>;
export declare function getPasswordParamValue(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function listAppDeployments(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function loadCachedImageArtifacts(options?: unknown): Promise<ResponseDataAndStatus<ImageArtifact[]>>;
export declare function loadProjectConfig(options?: unknown): Promise<ResponseDataAndStatus<SingleConfig>>;
export declare function publishAppDeployment(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function runCode(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function setAppDefinition(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function setParamEnteredValue(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function updateArtifacts(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function uploadBinary(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function validateAppDefinition(options?: unknown): Promise<ResponseDataAndStatus>;
export declare function callOpenAPI<T>(promise: Promise<T> | T): Promise<T>;
export declare function getErrorDetail(value: unknown): string | null;
export declare function getErrorCode(value: unknown): string | null;
export declare function res200<T>(response: ResponseDataAndStatus<T>): response is ResponseDataAndStatus<T> & { data: T; status: number };
export declare function configureAppSubsystemOpenAPI(): void;
export declare function buildBinaryDownloadUrl(contentId: string, shareSessionId: string | null, serverMode: string | null): string;

export declare const APP_SUBSYSTEM_FRONTEND_HOST_API_VERSION: 1;
export type AppSubsystemNotificationType = "error" | "warning" | "info" | "save";
export type AppSubsystemNotification = {
  message: string;
  type?: AppSubsystemNotificationType;
};
export type AppSubsystemProjectMetadataEntry = {
  id: string;
  name: string;
};
export type AppSubsystemProjectConfigSnapshot = {
  id: string | null;
  name: string;
  entryCodeBlockId: string | null;
};
export type AppSubsystemProjectContext = {
  defaultProjectConfigId: string | null;
  projectMetadata: AppSubsystemProjectMetadataEntry[];
  projectConfig: AppSubsystemProjectConfigSnapshot;
};
export type AppSubsystemRuntimeContext = {
  isAppDeploymentMode: boolean;
  shareSessionId: string | null;
  sessionRunCount: number;
  sharePolicy: Policy | null;
  defaultRunSnapshotMode: RunSnapshotMode;
  runSnapshotModeByProjectConfigId: Record<string, RunSnapshotMode>;
};
export type AppSubsystemProjectStateSnapshot = SingleConfig & {
  previewSectionVariantMap: Record<string, string>;
};
export type AppSubsystemProjectLoadState = {
  projectIsLoading: boolean;
  projectIs404: boolean;
};
export type AppSubsystemServerModeState = {
  mode: string | null;
  modeResolved: boolean;
  modeError: string | null;
};
export type AppSubsystemDeploymentSession = JsonRecord & {
  deploymentName: string;
  deploymentVersion: string;
  shareSessionId: string;
  sessionRunCount: number;
  defaultProjectConfigId: string;
  projectMetadata: AppSubsystemProjectMetadataEntry[];
  appPolicy: Policy | null;
  manifest: unknown | null;
};
export type AppSubsystemRealtimeDependencyEvent = {
  dependencyKey: BaseDependencyKeyUnion;
  payload?: BaseDependencyValueUnion | null;
  binaryPayload?: ArrayBuffer;
  timestampMs?: number;
};
export type AppSubsystemFrontendHost = {
  apiVersion: typeof APP_SUBSYSTEM_FRONTEND_HOST_API_VERSION;
  closeModal: () => void;
  notify: (notification: AppSubsystemNotification) => void;
  emitRealtimeDependencyEvent: (event: AppSubsystemRealtimeDependencyEvent, projectConfigIdOverride?: string | null) => void;
  emitRealtimeSectionParamLiteral: (sectionId: string, codeObjId: string, payload: string, projectConfigIdOverride?: string | null) => void;
  getProjectContext: () => AppSubsystemProjectContext;
  subscribeProjectContext: (listener: (context: AppSubsystemProjectContext) => void) => () => void;
  getProjectStateSnapshot: () => AppSubsystemProjectStateSnapshot;
  subscribeProjectStateSnapshot: (listener: (projectState: AppSubsystemProjectStateSnapshot) => void) => () => void;
  getRuntimeContext: () => AppSubsystemRuntimeContext;
  subscribeRuntimeContext: (listener: (context: AppSubsystemRuntimeContext) => void) => () => void;
  getAppDeploymentSession: () => AppSubsystemDeploymentSession | null;
  setAppDeploymentSession: (session: AppSubsystemDeploymentSession | null) => void;
  incrementAppDeploymentSessionRunCount: () => void;
  getServerModeState: () => AppSubsystemServerModeState;
  subscribeServerModeState: (listener: (serverMode: AppSubsystemServerModeState) => void) => () => void;
  setServerModeState: (serverMode: AppSubsystemServerModeState) => void;
  setProjectLoadState: (loadState: AppSubsystemProjectLoadState) => void;
  resetProjectRuntimeState: () => void;
};
export declare function createAppSubsystemFrontendHost(overrides?: Partial<AppSubsystemFrontendHost>): AppSubsystemFrontendHost;

export type AppSubsystemOverviewTabProps = Record<string, never>;
export type AppSubsystemPreviewSurfaceProps = Record<string, never>;
export type AppSubsystemAppModeRouteProps = Record<string, never>;
export type AppSubsystemAppDeploymentModalProps = {
  open: boolean;
};
export type AppSubsystemRenderer<Props> = {
  mount: (target: HTMLElement, props: Props, host: AppSubsystemFrontendHost) => void;
  update?: (target: HTMLElement, props: Props, host: AppSubsystemFrontendHost) => void;
  unmount?: (target: HTMLElement) => void;
};
export type AppSubsystemOverviewTabRegistration = {
  renderer: AppSubsystemRenderer<AppSubsystemOverviewTabProps>;
  titleQuickInfo: string;
  moreMenuQuickInfo: string;
  moreMenuLabel: string;
};
export type AppSubsystemPreviewSurfaceRegistration = {
  renderer: AppSubsystemRenderer<AppSubsystemPreviewSurfaceProps>;
};
export type AppSubsystemAppModeRouteRegistration = {
  renderer: AppSubsystemRenderer<AppSubsystemAppModeRouteProps>;
};
export type AppSubsystemAppDeploymentModalRegistration = {
  renderer: AppSubsystemRenderer<AppSubsystemAppDeploymentModalProps>;
};
export type AppSubsystemCustomSlashCommandModeOption = {
  id: string;
  name: string;
};
export type AppSubsystemCustomSlashCommandModesRegistration = {
  options: AppSubsystemCustomSlashCommandModeOption[];
  defaultMode: string;
};
export type AppSubsystemPatchPreviewDelta = {
  toolCallId: string;
  previewValueDelta: string;
};
export type AppSubsystemSessionInitializationOptions = {
  forceNewSession?: boolean;
};
export type AppSubsystemChatSlashCommandDefinition = {
  command: string;
  action: string;
  summary: string;
  promptTemplate?: string;
  appGenerationMode?: string | null;
  requiresImageAttachment?: boolean;
  unavailableFeedback?: string;
};
export type AppSubsystemChatRegistration = {
  slashCommands: AppSubsystemChatSlashCommandDefinition[];
  imageRequiredModes: string[];
  customSlashCommandModes: AppSubsystemCustomSlashCommandModesRegistration;
};
export type AppSubsystemFrontendController = {
  getPreviewEnabled?: () => boolean;
  subscribePreviewEnabled?: (listener: (previewEnabled: boolean) => void) => () => void;
  applyAppDefinitionStructuredContentToStore?: (structured: Record<string, unknown>) => boolean;
  applyAppSpecPatchPreviewDeltaToStore?: (args: AppSubsystemPatchPreviewDelta) => void;
  clearAppSpecPatchPreviewStream?: (toolCallId: string) => void;
  clearAllAppSpecPatchPreviewStreams?: () => void;
  initializeAppSessionFromCurrentDeployment?: (host: AppSubsystemFrontendHost, options?: AppSubsystemSessionInitializationOptions) => Promise<boolean>;
  resetAppSessionState?: (host: AppSubsystemFrontendHost) => void;
  processAppProjectStateUpdateFromBackend?: (payload: GetLatestProjectStateResponse) => void;
  initializeProjectState?: () => void;
  resetProjectState?: () => void;
};
export type AppSubsystemFrontendRegistration = {
  overviewTab?: AppSubsystemOverviewTabRegistration;
  previewSurface?: AppSubsystemPreviewSurfaceRegistration;
  appModeRoute?: AppSubsystemAppModeRouteRegistration;
  appDeploymentModal?: AppSubsystemAppDeploymentModalRegistration;
  chat?: AppSubsystemChatRegistration;
  controller?: AppSubsystemFrontendController;
};
export type RegisteredAppSubsystemFrontendRegistration = AppSubsystemFrontendRegistration & {
  pluginId: string;
};
export type AppSubsystemPluginRegistrationHost = {
  apiVersion: number;
  pluginId: string;
  registerAppSubsystem: (definition: AppSubsystemFrontendRegistration) => void;
};
export declare function isAppSubsystemFrontendRegistration(value: unknown): value is AppSubsystemFrontendRegistration;
export declare function resolveAppSubsystemPluginRegistrationHost(host: unknown): AppSubsystemPluginRegistrationHost;
export declare function registerAppSubsystemPlugin(host: unknown, registration: AppSubsystemFrontendRegistration): AppSubsystemPluginRegistrationHost;
export declare function buildDefaultAppSpecPath(pluginId: string | null | undefined): string;
export declare function activateAppSubsystemFrontendHostRuntime(host: AppSubsystemFrontendHost): void;
export declare function deactivateAppSubsystemFrontendHostRuntime(host: AppSubsystemFrontendHost): void;
export declare function getActiveAppSubsystemFrontendHostRuntime(): AppSubsystemFrontendHost | null;
export declare function getCurrentEffectiveCodeObjImplWithTypeGuardIfPresent<T>(projectState: SingleConfig, sectionId: string, codeObjId: string, guard: (value: JsonRecord) => value is T): T | null;
export declare function getCurrentEffectiveSectionImpl(projectState: SingleConfig, sectionId: string, includePreview?: boolean): JsonRecord;
export declare function getCurrentEffectiveSectionImplIfPresent(projectState: SingleConfig, sectionId: string, includePreview?: boolean): JsonRecord | null;
export declare function getCurrentSectionVariantId(projectState: SingleConfig, sectionId: string, includePreview?: boolean): string;
export declare function getCurrentSectionVariantIdIfPresent(projectState: SingleConfig, sectionId: string, includePreview?: boolean): string | null;
export declare function getParamDisplayNameIfPresent(projectState: SingleConfig, sectionId: string, codeObjId: string): string | null;
