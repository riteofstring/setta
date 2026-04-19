import type {
  BaseDependencyKeyUnion,
  BaseDependencyValueUnion,
  GetAppDeploymentCurrentSessionResponses,
  GetLatestProjectStateResponse,
  HttpapiServerModeResponse,
  Policy,
  RunSnapshotMode,
} from "./openapi";
import { createSettingsState, createSingleConfig } from "./openapi";

export const APP_SUBSYSTEM_FRONTEND_HOST_API_VERSION = 1;

export type AppSubsystemNotificationType =
  | "error"
  | "warning"
  | "info"
  | "save";

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

export type AppSubsystemProjectStateSnapshot =
  GetLatestProjectStateResponse["projectState"] & {
    previewSectionVariantMap: Record<string, string>;
  };

export type AppSubsystemProjectLoadState = {
  projectIsLoading: boolean;
  projectIs404: boolean;
};

export type AppSubsystemServerModeState = {
  mode: HttpapiServerModeResponse["mode"] | null;
  modeResolved: boolean;
  modeError: string | null;
};

export type AppSubsystemDeploymentSession =
  GetAppDeploymentCurrentSessionResponses[200];

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
  emitRealtimeDependencyEvent: (
    event: AppSubsystemRealtimeDependencyEvent,
    projectConfigIdOverride?: string | null,
  ) => void;
  emitRealtimeSectionParamLiteral: (
    sectionId: string,
    codeObjId: string,
    payload: string,
    projectConfigIdOverride?: string | null,
  ) => void;
  getProjectContext: () => AppSubsystemProjectContext;
  subscribeProjectContext: (
    listener: (context: AppSubsystemProjectContext) => void,
  ) => () => void;
  getProjectStateSnapshot: () => AppSubsystemProjectStateSnapshot;
  subscribeProjectStateSnapshot: (
    listener: (projectState: AppSubsystemProjectStateSnapshot) => void,
  ) => () => void;
  getRuntimeContext: () => AppSubsystemRuntimeContext;
  subscribeRuntimeContext: (
    listener: (context: AppSubsystemRuntimeContext) => void,
  ) => () => void;
  getAppDeploymentSession: () => AppSubsystemDeploymentSession | null;
  setAppDeploymentSession: (
    session: AppSubsystemDeploymentSession | null,
  ) => void;
  incrementAppDeploymentSessionRunCount: () => void;
  getServerModeState: () => AppSubsystemServerModeState;
  subscribeServerModeState: (
    listener: (serverMode: AppSubsystemServerModeState) => void,
  ) => () => void;
  setServerModeState: (serverMode: AppSubsystemServerModeState) => void;
  setProjectLoadState: (loadState: AppSubsystemProjectLoadState) => void;
  resetProjectRuntimeState: () => void;
};

const EMPTY_APP_SUBSYSTEM_PROJECT_CONTEXT = Object.freeze({
  defaultProjectConfigId: null,
  projectMetadata: [],
  projectConfig: {
    id: null,
    name: "",
    entryCodeBlockId: null,
  },
}) satisfies AppSubsystemProjectContext;

const EMPTY_APP_SUBSYSTEM_RUNTIME_CONTEXT = Object.freeze({
  isAppDeploymentMode: false,
  shareSessionId: null,
  sessionRunCount: 0,
  sharePolicy: null,
  defaultRunSnapshotMode: createSettingsState().backend.runSnapshotMode,
  runSnapshotModeByProjectConfigId: {},
}) satisfies AppSubsystemRuntimeContext;

const EMPTY_APP_SUBSYSTEM_PROJECT_STATE_SNAPSHOT = Object.freeze({
  ...createSingleConfig(),
  previewSectionVariantMap: {},
}) as AppSubsystemProjectStateSnapshot;

const EMPTY_APP_SUBSYSTEM_SERVER_MODE_STATE = Object.freeze({
  mode: null,
  modeResolved: false,
  modeError: null,
}) satisfies AppSubsystemServerModeState;

export function createAppSubsystemFrontendHost(
  overrides: Partial<AppSubsystemFrontendHost> = {},
): AppSubsystemFrontendHost {
  return {
    apiVersion: APP_SUBSYSTEM_FRONTEND_HOST_API_VERSION,
    closeModal: () => undefined,
    notify: () => undefined,
    emitRealtimeDependencyEvent: () => undefined,
    emitRealtimeSectionParamLiteral: () => undefined,
    getProjectContext: () => EMPTY_APP_SUBSYSTEM_PROJECT_CONTEXT,
    subscribeProjectContext: () => () => undefined,
    getProjectStateSnapshot: () => EMPTY_APP_SUBSYSTEM_PROJECT_STATE_SNAPSHOT,
    subscribeProjectStateSnapshot: () => () => undefined,
    getRuntimeContext: () => EMPTY_APP_SUBSYSTEM_RUNTIME_CONTEXT,
    subscribeRuntimeContext: () => () => undefined,
    getAppDeploymentSession: () => null,
    setAppDeploymentSession: () => undefined,
    incrementAppDeploymentSessionRunCount: () => undefined,
    getServerModeState: () => EMPTY_APP_SUBSYSTEM_SERVER_MODE_STATE,
    subscribeServerModeState: () => () => undefined,
    setServerModeState: () => undefined,
    setProjectLoadState: () => undefined,
    resetProjectRuntimeState: () => undefined,
    ...overrides,
  };
}

export type AppSubsystemOverviewTabProps = Record<string, never>;
export type AppSubsystemPreviewSurfaceProps = Record<string, never>;
export type AppSubsystemAppModeRouteProps = Record<string, never>;
export type AppSubsystemAppDeploymentModalProps = {
  open: boolean;
};

export type AppSubsystemRenderer<Props> = {
  mount: (
    target: HTMLElement,
    props: Props,
    host: AppSubsystemFrontendHost,
  ) => void;
  update?: (
    target: HTMLElement,
    props: Props,
    host: AppSubsystemFrontendHost,
  ) => void;
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
  subscribePreviewEnabled?: (
    listener: (previewEnabled: boolean) => void,
  ) => () => void;
  applyAppDefinitionStructuredContentToStore?: (
    structured: Record<string, unknown>,
  ) => boolean;
  applyAppSpecPatchPreviewDeltaToStore?: (
    args: AppSubsystemPatchPreviewDelta,
  ) => void;
  clearAppSpecPatchPreviewStream?: (toolCallId: string) => void;
  clearAllAppSpecPatchPreviewStreams?: () => void;
  initializeAppSessionFromCurrentDeployment?: (
    host: AppSubsystemFrontendHost,
    options?: AppSubsystemSessionInitializationOptions,
  ) => Promise<boolean>;
  resetAppSessionState?: (host: AppSubsystemFrontendHost) => void;
  processAppProjectStateUpdateFromBackend?: (
    payload: GetLatestProjectStateResponse,
  ) => void;
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

export type RegisteredAppSubsystemFrontendRegistration =
  AppSubsystemFrontendRegistration & {
    pluginId: string;
  };

export type AppSubsystemPluginRegistrationHost = {
  apiVersion: number;
  pluginId: string;
  registerAppSubsystem: (definition: AppSubsystemFrontendRegistration) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFunction(
  value: unknown,
): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function isAppSubsystemRenderer<Props>(
  value: unknown,
): value is AppSubsystemRenderer<Props> {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isFunction(value.mount) &&
    (value.update === undefined || isFunction(value.update)) &&
    (value.unmount === undefined || isFunction(value.unmount))
  );
}

function isOverviewTabRegistration(
  value: unknown,
): value is AppSubsystemOverviewTabRegistration {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isAppSubsystemRenderer<AppSubsystemOverviewTabProps>(value.renderer) &&
    typeof value.titleQuickInfo === "string" &&
    typeof value.moreMenuQuickInfo === "string" &&
    typeof value.moreMenuLabel === "string"
  );
}

function isPreviewSurfaceRegistration(
  value: unknown,
): value is AppSubsystemPreviewSurfaceRegistration {
  return (
    isRecord(value) &&
    isAppSubsystemRenderer<AppSubsystemPreviewSurfaceProps>(value.renderer)
  );
}

function isAppModeRouteRegistration(
  value: unknown,
): value is AppSubsystemAppModeRouteRegistration {
  return (
    isRecord(value) &&
    isAppSubsystemRenderer<AppSubsystemAppModeRouteProps>(value.renderer)
  );
}

function isAppDeploymentModalRegistration(
  value: unknown,
): value is AppSubsystemAppDeploymentModalRegistration {
  return (
    isRecord(value) &&
    isAppSubsystemRenderer<AppSubsystemAppDeploymentModalProps>(value.renderer)
  );
}

function isSlashCommandRegistration(
  value: unknown,
): value is AppSubsystemChatSlashCommandDefinition[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.command === "string" &&
      typeof entry.action === "string" &&
      typeof entry.summary === "string" &&
      (entry.requiresImageAttachment === undefined ||
        typeof entry.requiresImageAttachment === "boolean") &&
      (entry.promptTemplate === undefined ||
        typeof entry.promptTemplate === "string") &&
      (entry.appGenerationMode === undefined ||
        entry.appGenerationMode === null ||
        typeof entry.appGenerationMode === "string") &&
      (entry.unavailableFeedback === undefined ||
        typeof entry.unavailableFeedback === "string"),
  );
}

function isImageRequiredModeRegistration(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
  );
}

function isCustomSlashCommandModeRegistration(
  value: unknown,
): value is AppSubsystemCustomSlashCommandModesRegistration {
  if (!isRecord(value) || typeof value.defaultMode !== "string") {
    return false;
  }
  const options = value.options;
  if (!Array.isArray(options)) {
    return false;
  }
  return options.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.id === "string" &&
      typeof entry.name === "string",
  );
}

function isChatRegistration(
  value: unknown,
): value is AppSubsystemChatRegistration {
  return (
    isRecord(value) &&
    isSlashCommandRegistration(value.slashCommands) &&
    isImageRequiredModeRegistration(value.imageRequiredModes) &&
    isCustomSlashCommandModeRegistration(value.customSlashCommandModes)
  );
}

function hasOptionalRegistration<T>(
  value: Record<string, unknown>,
  key: string,
  validator: (entry: unknown) => entry is T,
): boolean {
  const entry = value[key];
  if (entry === undefined) {
    return true;
  }
  return validator(entry);
}

function hasOptionalFunction(
  value: Record<string, unknown>,
  key: string,
): boolean {
  const entry = value[key];
  if (entry === undefined) {
    return true;
  }
  return isFunction(entry);
}

const APP_SUBSYSTEM_FRONTEND_REGISTRATION_VALIDATORS = [
  ["overviewTab", isOverviewTabRegistration],
  ["previewSurface", isPreviewSurfaceRegistration],
  ["appModeRoute", isAppModeRouteRegistration],
  ["appDeploymentModal", isAppDeploymentModalRegistration],
  ["chat", isChatRegistration],
] as const;

const APP_SUBSYSTEM_FRONTEND_CONTROLLER_OPTIONAL_FUNCTION_KEYS = [
  "getPreviewEnabled",
  "subscribePreviewEnabled",
  "applyAppDefinitionStructuredContentToStore",
  "applyAppSpecPatchPreviewDeltaToStore",
  "clearAppSpecPatchPreviewStream",
  "clearAllAppSpecPatchPreviewStreams",
  "initializeAppSessionFromCurrentDeployment",
  "resetAppSessionState",
  "processAppProjectStateUpdateFromBackend",
  "initializeProjectState",
  "resetProjectState",
] as const;

function isControllerRegistration(
  value: unknown,
): value is AppSubsystemFrontendController {
  if (!isRecord(value)) {
    return false;
  }
  return APP_SUBSYSTEM_FRONTEND_CONTROLLER_OPTIONAL_FUNCTION_KEYS.every((key) =>
    hasOptionalFunction(value, key),
  );
}

function hasValidOptionalFrontendFunctions(
  value: Record<string, unknown>,
): boolean {
  return hasOptionalRegistration(value, "controller", isControllerRegistration);
}

export function isAppSubsystemFrontendRegistration(
  value: unknown,
): value is AppSubsystemFrontendRegistration {
  if (!isRecord(value)) {
    return false;
  }
  for (const [
    key,
    validator,
  ] of APP_SUBSYSTEM_FRONTEND_REGISTRATION_VALIDATORS) {
    if (!hasOptionalRegistration(value, key, validator)) {
      return false;
    }
  }
  return hasValidOptionalFrontendFunctions(value);
}

export function resolveAppSubsystemPluginRegistrationHost(
  host: unknown,
): AppSubsystemPluginRegistrationHost {
  if (!isRecord(host)) {
    throw new Error(
      "Plugin host does not support registerAppSubsystem for app-subsystem providers.",
    );
  }
  if (
    typeof host.pluginId !== "string" ||
    host.pluginId.trim().length === 0 ||
    typeof host.apiVersion !== "number" ||
    !isFunction(host.registerAppSubsystem)
  ) {
    throw new Error(
      "Plugin host does not support registerAppSubsystem for app-subsystem providers.",
    );
  }
  return host as AppSubsystemPluginRegistrationHost;
}

export function registerAppSubsystemPlugin(
  host: unknown,
  registration: AppSubsystemFrontendRegistration,
): AppSubsystemPluginRegistrationHost {
  const resolvedHost = resolveAppSubsystemPluginRegistrationHost(host);
  resolvedHost.registerAppSubsystem(registration);
  return resolvedHost;
}

export function buildDefaultAppSpecPath(
  pluginId: string | null | undefined,
): string {
  const normalizedPluginId = pluginId?.trim() ?? "";
  if (normalizedPluginId.length === 0) {
    return "";
  }
  return `plugins/${normalizedPluginId}/app_specs/app.json`;
}
