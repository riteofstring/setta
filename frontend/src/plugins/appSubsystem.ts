import type { ChatSlashCommandDefinition } from "components/Chat/chatComposerControls";
import type { GetLatestProjectStateResponse } from "openapi/http";
import { type ComponentType } from "react";
import { PluginRuntimeResponse } from "utils/generatedTypes";
import { createWithEqualityFn } from "zustand/traditional";

type AppSubsystemCapabilities = NonNullable<
  PluginRuntimeResponse["featureCapabilities"]
>["appSubsystem"];

type AppSubsystemOverviewTabRegistration = {
  component: ComponentType;
  titleQuickInfo: string;
  moreMenuQuickInfo: string;
  moreMenuLabel: string;
};

type AppSubsystemPreviewSurfaceRegistration = {
  component: ComponentType;
};

type AppSubsystemAppModeRouteRegistration = {
  component: ComponentType;
};

type AppSubsystemAppDeploymentModalRegistration = {
  component: ComponentType<{ open: boolean }>;
};

type AppSubsystemCustomSlashCommandModeOption = {
  id: string;
  name: string;
};

type AppSubsystemCustomSlashCommandModesRegistration = {
  options: AppSubsystemCustomSlashCommandModeOption[];
  defaultMode: string;
};

type AppSubsystemPatchPreviewDelta = {
  toolCallId: string;
  previewValueDelta: string;
};

type AppSubsystemSessionInitializationOptions = {
  forceNewSession?: boolean;
};

export type AppSubsystemFrontendRegistration = {
  overviewTab?: AppSubsystemOverviewTabRegistration;
  previewSurface?: AppSubsystemPreviewSurfaceRegistration;
  appModeRoute?: AppSubsystemAppModeRouteRegistration;
  appDeploymentModal?: AppSubsystemAppDeploymentModalRegistration;
  slashCommands?: ChatSlashCommandDefinition[];
  imageRequiredModes?: string[];
  customSlashCommandModes?: AppSubsystemCustomSlashCommandModesRegistration;
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
    options?: AppSubsystemSessionInitializationOptions,
  ) => Promise<boolean>;
  resetAppSessionState?: () => void;
  processAppProjectStateUpdateFromBackend?: (
    payload: GetLatestProjectStateResponse,
  ) => void;
  initializeProjectState?: () => void;
  resetProjectState?: () => void;
};

export type RegisteredAppSubsystemFrontendRegistration =
  AppSubsystemFrontendRegistration & {
    pluginId: string;
  };

export type AppSubsystemFrontendRegistrationsByPluginId = Record<
  string,
  RegisteredAppSubsystemFrontendRegistration
>;

type AppSubsystemFrontendStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "unavailable"
  | "error";

type AppSubsystemFrontendStore = {
  capabilities: AppSubsystemCapabilities | null;
  status: AppSubsystemFrontendStatus;
  statusMessage: string | null;
  capabilitySignature: string | null;
  previewEnabled: boolean;
  registration: RegisteredAppSubsystemFrontendRegistration | null;
};

const INITIAL_APP_SUBSYSTEM_FRONTEND_STORE: AppSubsystemFrontendStore = {
  capabilities: null,
  status: "idle",
  statusMessage: null,
  capabilitySignature: null,
  previewEnabled: false,
  registration: null,
};
const EMPTY_APP_SUBSYSTEM_SLASH_COMMANDS: ChatSlashCommandDefinition[] = [];
const EMPTY_APP_SUBSYSTEM_SUPPORTED_APP_GENERATION_MODES: string[] = [];
const DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE = "plain_chat";
const DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS: AppSubsystemCustomSlashCommandModeOption[] =
  [{ id: DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE, name: "Plain chat" }];

let appSubsystemPreviewEnabledUnsubscribe: (() => void) | null = null;

type AppSubsystemPendingOperation =
  | {
      kind: "applyAppDefinitionStructuredContent";
      structured: Record<string, unknown>;
    }
  | {
      kind: "applyAppSpecPatchPreviewDelta";
      args: AppSubsystemPatchPreviewDelta;
    }
  | { kind: "clearAppSpecPatchPreviewStream"; toolCallId: string }
  | { kind: "clearAllAppSpecPatchPreviewStreams" }
  | {
      kind: "processAppProjectStateUpdate";
      payload: GetLatestProjectStateResponse;
    }
  | { kind: "resetAppSessionState" };

const pendingAppSubsystemOperationsByCapabilitySignature = new Map<
  string,
  AppSubsystemPendingOperation[]
>();

export const useAppSubsystemFrontendStore =
  createWithEqualityFn<AppSubsystemFrontendStore>(() => ({
    ...INITIAL_APP_SUBSYSTEM_FRONTEND_STORE,
  }));

function buildAppSubsystemCapabilitySignature(
  capabilities: AppSubsystemCapabilities | null,
  selectedProviderFrontendRefreshSignature?: string | null,
): string {
  if (capabilities === null) {
    return "";
  }
  return [
    capabilities.pluginId,
    capabilities.pluginEnabled ? "1" : "0",
    capabilities.appAuthoringUi ? "1" : "0",
    capabilities.appPreviewUi ? "1" : "0",
    capabilities.appGenerationChatModes ? "1" : "0",
    capabilities.appDeploymentRuntime ? "1" : "0",
    selectedProviderFrontendRefreshSignature?.trim() ?? "",
  ].join(":");
}

export function buildDefaultAppSpecPath(
  pluginID: string | null | undefined,
): string {
  const normalizedPluginID = pluginID?.trim() ?? "";
  if (normalizedPluginID.length === 0) {
    return "";
  }
  return `plugins/${normalizedPluginID}/app_specs/app.json`;
}

function hasFrontendSurfaceAvailability(
  capabilities: AppSubsystemCapabilities | null,
): boolean {
  if (!capabilities?.pluginEnabled) {
    return false;
  }
  return (
    capabilities.appAuthoringUi ||
    capabilities.appPreviewUi ||
    capabilities.appGenerationChatModes ||
    capabilities.appDeploymentRuntime
  );
}

function appendSupportedAppGenerationMode(
  modes: string[],
  seenModes: Set<string>,
  rawMode: string | null | undefined,
  excludePlainChat = false,
): void {
  const mode = rawMode?.trim() ?? "";
  if (!mode || seenModes.has(mode)) {
    return;
  }
  if (
    excludePlainChat &&
    mode === DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE
  ) {
    return;
  }
  seenModes.add(mode);
  modes.push(mode);
}

function collectSupportedAppGenerationModes(
  registration: AppSubsystemFrontendRegistration | null,
): string[] {
  if (registration === null) {
    return EMPTY_APP_SUBSYSTEM_SUPPORTED_APP_GENERATION_MODES;
  }
  const seenModes = new Set<string>();
  const modes: string[] = [];
  for (const command of registration.slashCommands ?? []) {
    appendSupportedAppGenerationMode(
      modes,
      seenModes,
      command.appGenerationMode,
    );
  }
  for (const option of registration.customSlashCommandModes?.options ?? []) {
    appendSupportedAppGenerationMode(modes, seenModes, option.id, true);
  }
  appendSupportedAppGenerationMode(
    modes,
    seenModes,
    registration.customSlashCommandModes?.defaultMode,
    true,
  );
  return modes.length === 0
    ? EMPTY_APP_SUBSYSTEM_SUPPORTED_APP_GENERATION_MODES
    : modes;
}

function quotedPluginIDs(pluginIDs: string[] | undefined): string {
  const normalized = (pluginIDs ?? [])
    .map((pluginID) => pluginID.trim())
    .filter((pluginID) => pluginID.length > 0)
    .sort();
  if (normalized.length === 0) {
    return "none";
  }
  return normalized.map((pluginID) => `"${pluginID}"`).join(", ");
}

function buildProviderListUnavailableMessage(
  reason: string,
  pluginIDs: string[] | undefined,
  suffix = ".",
): string {
  return `App mode is unavailable because ${reason}: ${quotedPluginIDs(pluginIDs)}${suffix}`;
}

function buildSelectedProviderMissingDeploymentRuntimeMessage(
  capabilities: AppSubsystemCapabilities | null,
): string {
  const pluginID = capabilities?.pluginId?.trim() || "";
  if (pluginID) {
    return `App mode is unavailable because app subsystem provider "${pluginID}" does not declare app deployment runtime support.`;
  }
  return "App mode is unavailable because the selected app subsystem provider does not declare app deployment runtime support.";
}

export function getAppSubsystemDeploymentRuntimeUnavailableMessage(
  capabilities: AppSubsystemCapabilities | null,
): string {
  const selection = capabilities?.providerSelection;
  if (!selection) {
    return "App mode is unavailable because no app subsystem provider is active.";
  }

  switch (selection.status) {
    case "disabled_provider":
      return buildProviderListUnavailableMessage(
        "installed app subsystem providers are disabled",
        selection.disabledPluginIds,
      );
    case "invalid_provider":
      return buildProviderListUnavailableMessage(
        "installed app subsystem providers are invalid",
        selection.invalidPluginIds,
      );
    case "provider_conflict":
      return buildProviderListUnavailableMessage(
        "multiple app subsystem providers are active",
        selection.conflictingPluginIds,
        ". Disable all but one.",
      );
    case "active":
      return buildSelectedProviderMissingDeploymentRuntimeMessage(capabilities);
    case "no_provider":
    default:
      return "App mode is unavailable because no app subsystem provider is active.";
  }
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isComponent(value: unknown): value is ComponentType {
  return isFunction(value);
}

function isOverviewTabRegistration(
  value: unknown,
): value is AppSubsystemOverviewTabRegistration {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isComponent(value.component) &&
    typeof value.titleQuickInfo === "string" &&
    typeof value.moreMenuQuickInfo === "string" &&
    typeof value.moreMenuLabel === "string"
  );
}

function isPreviewSurfaceRegistration(
  value: unknown,
): value is AppSubsystemPreviewSurfaceRegistration {
  return isRecord(value) && isComponent(value.component);
}

function isAppModeRouteRegistration(
  value: unknown,
): value is AppSubsystemAppModeRouteRegistration {
  return isRecord(value) && isComponent(value.component);
}

function isAppDeploymentModalRegistration(
  value: unknown,
): value is AppSubsystemAppDeploymentModalRegistration {
  return isRecord(value) && isComponent(value.component);
}

function isSlashCommandRegistration(
  value: unknown,
): value is ChatSlashCommandDefinition[] {
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
        typeof entry.promptTemplate === "string"),
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

function clearPendingAppSubsystemOperations(
  capabilitySignature?: string | null,
): void {
  if (!capabilitySignature) {
    pendingAppSubsystemOperationsByCapabilitySignature.clear();
    return;
  }
  pendingAppSubsystemOperationsByCapabilitySignature.delete(
    capabilitySignature,
  );
}

function enqueuePendingAppSubsystemOperation(
  capabilitySignature: string,
  operation: AppSubsystemPendingOperation,
): void {
  if (capabilitySignature.trim().length === 0) {
    return;
  }
  const queuedOperations =
    pendingAppSubsystemOperationsByCapabilitySignature.get(capabilitySignature);
  if (queuedOperations) {
    queuedOperations.push(operation);
    return;
  }
  pendingAppSubsystemOperationsByCapabilitySignature.set(capabilitySignature, [
    operation,
  ]);
}

function clearPreviewEnabledSubscription(): void {
  if (!appSubsystemPreviewEnabledUnsubscribe) {
    return;
  }
  appSubsystemPreviewEnabledUnsubscribe();
  appSubsystemPreviewEnabledUnsubscribe = null;
}

function applyPreviewEnabledState(previewEnabled: boolean): void {
  useAppSubsystemFrontendStore.setState((state) =>
    state.previewEnabled === previewEnabled
      ? state
      : {
          ...state,
          previewEnabled,
        },
  );
}

const APP_SUBSYSTEM_FRONTEND_REGISTRATION_VALIDATORS = [
  ["overviewTab", isOverviewTabRegistration],
  ["previewSurface", isPreviewSurfaceRegistration],
  ["appModeRoute", isAppModeRouteRegistration],
  ["appDeploymentModal", isAppDeploymentModalRegistration],
  ["slashCommands", isSlashCommandRegistration],
  ["imageRequiredModes", isImageRequiredModeRegistration],
  ["customSlashCommandModes", isCustomSlashCommandModeRegistration],
] as const;
const APP_SUBSYSTEM_FRONTEND_OPTIONAL_FUNCTION_KEYS = [
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

function hasValidOptionalFrontendFunctions(
  value: Record<string, unknown>,
): boolean {
  return APP_SUBSYSTEM_FRONTEND_OPTIONAL_FUNCTION_KEYS.every((key) =>
    hasOptionalFunction(value, key),
  );
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

function formatAppSubsystemFrontendLoadError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to resolve app subsystem frontend registration.";
}

function bindPreviewEnabledRegistration(
  registration: AppSubsystemFrontendRegistration,
): boolean {
  clearPreviewEnabledSubscription();
  const previewEnabled = registration.getPreviewEnabled?.() ?? false;
  if (!registration.subscribePreviewEnabled) {
    return previewEnabled;
  }
  appSubsystemPreviewEnabledUnsubscribe = registration.subscribePreviewEnabled(
    (nextPreviewEnabled) => {
      applyPreviewEnabledState(nextPreviewEnabled);
    },
  );
  return previewEnabled;
}

const APP_SUBSYSTEM_PENDING_OPERATION_APPLIERS = {
  applyAppDefinitionStructuredContent: (
    registration: AppSubsystemFrontendRegistration,
    operation: Extract<
      AppSubsystemPendingOperation,
      { kind: "applyAppDefinitionStructuredContent" }
    >,
  ): void => {
    registration.applyAppDefinitionStructuredContentToStore?.(
      operation.structured,
    );
  },
  applyAppSpecPatchPreviewDelta: (
    registration: AppSubsystemFrontendRegistration,
    operation: Extract<
      AppSubsystemPendingOperation,
      { kind: "applyAppSpecPatchPreviewDelta" }
    >,
  ): void => {
    registration.applyAppSpecPatchPreviewDeltaToStore?.(operation.args);
  },
  clearAppSpecPatchPreviewStream: (
    registration: AppSubsystemFrontendRegistration,
    operation: Extract<
      AppSubsystemPendingOperation,
      { kind: "clearAppSpecPatchPreviewStream" }
    >,
  ): void => {
    registration.clearAppSpecPatchPreviewStream?.(operation.toolCallId);
  },
  clearAllAppSpecPatchPreviewStreams: (
    registration: AppSubsystemFrontendRegistration,
  ): void => {
    registration.clearAllAppSpecPatchPreviewStreams?.();
  },
  processAppProjectStateUpdate: (
    registration: AppSubsystemFrontendRegistration,
    operation: Extract<
      AppSubsystemPendingOperation,
      { kind: "processAppProjectStateUpdate" }
    >,
  ): void => {
    registration.processAppProjectStateUpdateFromBackend?.(operation.payload);
  },
  resetAppSessionState: (
    registration: AppSubsystemFrontendRegistration,
  ): void => {
    registration.resetAppSessionState?.();
  },
} as const;

function applyPendingAppSubsystemOperation(
  registration: AppSubsystemFrontendRegistration,
  operation: AppSubsystemPendingOperation,
): void {
  const applyOperation = APP_SUBSYSTEM_PENDING_OPERATION_APPLIERS[
    operation.kind
  ] as (
    registration: AppSubsystemFrontendRegistration,
    operation: AppSubsystemPendingOperation,
  ) => void;
  applyOperation(registration, operation);
}

function flushPendingAppSubsystemOperations(
  registration: AppSubsystemFrontendRegistration,
  capabilitySignature: string,
): void {
  if (
    pendingAppSubsystemOperationsByCapabilitySignature.size === 0 ||
    capabilitySignature.trim().length === 0
  ) {
    return;
  }
  const operations =
    pendingAppSubsystemOperationsByCapabilitySignature.get(capabilitySignature);
  if (!operations || operations.length === 0) {
    return;
  }
  clearPendingAppSubsystemOperations(capabilitySignature);
  for (const operation of operations) {
    applyPendingAppSubsystemOperation(registration, operation);
  }
}

function setUnavailableAppSubsystemFrontendState(
  capabilities: AppSubsystemCapabilities | null,
  capabilitySignature: string,
): void {
  clearPreviewEnabledSubscription();
  clearPendingAppSubsystemOperations();
  useAppSubsystemFrontendStore.getState().registration?.resetProjectState?.();
  useAppSubsystemFrontendStore.setState({
    capabilities,
    status: "unavailable",
    statusMessage: null,
    capabilitySignature,
    previewEnabled: false,
    registration: null,
  });
}

function shouldResetProjectStateForFrontendLoad(
  capabilities: AppSubsystemCapabilities | null,
  capabilitySignature: string,
): boolean {
  const currentState = useAppSubsystemFrontendStore.getState();
  return (
    currentState.registration !== null &&
    (currentState.capabilitySignature !== capabilitySignature ||
      currentState.registration.pluginId !== capabilities?.pluginId)
  );
}

function setLoadingAppSubsystemFrontendState(
  capabilities: AppSubsystemCapabilities | null,
  capabilitySignature: string,
  options: {
    clearPendingOperations: boolean;
  },
): void {
  const currentState = useAppSubsystemFrontendStore.getState();
  if (
    currentState.status === "loading" &&
    currentState.capabilitySignature === capabilitySignature
  ) {
    useAppSubsystemFrontendStore.setState((state) => ({
      ...state,
      capabilities,
    }));
    return;
  }
  clearPreviewEnabledSubscription();
  if (options.clearPendingOperations) {
    clearPendingAppSubsystemOperations();
  }
  if (
    shouldResetProjectStateForFrontendLoad(capabilities, capabilitySignature)
  ) {
    currentState.registration?.resetProjectState?.();
  }
  useAppSubsystemFrontendStore.setState({
    capabilities,
    status: "loading",
    statusMessage: null,
    capabilitySignature,
    previewEnabled: false,
    registration: null,
  });
}

function shouldReuseLoadedRegistration(
  capabilities: AppSubsystemCapabilities | null,
  capabilitySignature: string,
  registration: RegisteredAppSubsystemFrontendRegistration | null,
): boolean {
  const currentState = useAppSubsystemFrontendStore.getState();
  if (
    currentState.status !== "loaded" ||
    currentState.registration === null ||
    currentState.capabilitySignature !== capabilitySignature ||
    currentState.registration !== registration
  ) {
    return false;
  }
  useAppSubsystemFrontendStore.setState((state) => ({
    ...state,
    capabilities,
  }));
  return true;
}

function requireCapabilityRegistration(
  required: boolean | undefined,
  present: boolean,
  message: string,
): void {
  if (required && !present) {
    throw new Error(message);
  }
}

function validateFrontendRegistrationCapabilities(
  registration: AppSubsystemFrontendRegistration,
  capabilities: AppSubsystemCapabilities | null,
): void {
  requireCapabilityRegistration(
    capabilities?.appAuthoringUi,
    Boolean(registration.overviewTab),
    "App subsystem frontend adapter is missing the authoring overview registration.",
  );
  requireCapabilityRegistration(
    capabilities?.appPreviewUi,
    Boolean(registration.previewSurface),
    "App subsystem frontend adapter is missing the preview surface registration.",
  );
  requireCapabilityRegistration(
    capabilities?.appGenerationChatModes,
    (registration.slashCommands?.length ?? 0) > 0,
    "App subsystem frontend adapter is missing slash command registrations.",
  );
  requireCapabilityRegistration(
    capabilities?.appGenerationChatModes,
    Boolean(registration.customSlashCommandModes),
    "App subsystem frontend adapter is missing custom slash-command mode registrations.",
  );
  requireCapabilityRegistration(
    capabilities?.appDeploymentRuntime,
    Boolean(registration.appModeRoute),
    "App subsystem frontend adapter is missing the app mode route registration.",
  );
  requireCapabilityRegistration(
    capabilities?.appDeploymentRuntime,
    Boolean(registration.appDeploymentModal),
    "App subsystem frontend adapter is missing the app deployment modal registration.",
  );
}

function buildMissingFrontendRegistrationMessage(
  capabilities: AppSubsystemCapabilities | null,
): string {
  if (!capabilities?.pluginId) {
    return "The active app subsystem provider did not register frontend surfaces through the plugin host.";
  }
  return `App subsystem provider ${capabilities.pluginId} did not register frontend surfaces through the plugin host.`;
}

function selectAppSubsystemFrontendRegistration(
  capabilities: AppSubsystemCapabilities | null,
  registrationsByPluginId: AppSubsystemFrontendRegistrationsByPluginId,
): RegisteredAppSubsystemFrontendRegistration | null {
  if (capabilities?.pluginId?.trim() === "") {
    return null;
  }
  return registrationsByPluginId[capabilities.pluginId] ?? null;
}

function requireAppSubsystemFrontendRegistration(
  capabilities: AppSubsystemCapabilities | null,
  registration: RegisteredAppSubsystemFrontendRegistration | null,
): RegisteredAppSubsystemFrontendRegistration {
  if (registration !== null) {
    return registration;
  }
  throw new Error(buildMissingFrontendRegistrationMessage(capabilities));
}

export async function syncAppSubsystemFrontendRegistration(
  capabilities: AppSubsystemCapabilities | null,
  registrationsByPluginId: AppSubsystemFrontendRegistrationsByPluginId,
  selectedProviderFrontendRefreshSignature?: string | null,
): Promise<void> {
  const capabilitySignature = buildAppSubsystemCapabilitySignature(
    capabilities,
    selectedProviderFrontendRefreshSignature,
  );
  if (!hasFrontendSurfaceAvailability(capabilities)) {
    setUnavailableAppSubsystemFrontendState(capabilities, capabilitySignature);
    return;
  }

  const registration = selectAppSubsystemFrontendRegistration(
    capabilities,
    registrationsByPluginId,
  );

  if (
    shouldReuseLoadedRegistration(
      capabilities,
      capabilitySignature,
      registration,
    )
  ) {
    return;
  }

  setLoadingAppSubsystemFrontendState(capabilities, capabilitySignature, {
    clearPendingOperations: false,
  });

  try {
    const resolvedRegistration = requireAppSubsystemFrontendRegistration(
      capabilities,
      registration,
    );
    validateFrontendRegistrationCapabilities(
      resolvedRegistration,
      capabilities,
    );
    if (
      useAppSubsystemFrontendStore.getState().capabilitySignature !==
      capabilitySignature
    ) {
      return;
    }
    resolvedRegistration.initializeProjectState?.();
    const previewEnabled = bindPreviewEnabledRegistration(resolvedRegistration);
    flushPendingAppSubsystemOperations(
      resolvedRegistration,
      capabilitySignature,
    );
    if (
      useAppSubsystemFrontendStore.getState().capabilitySignature !==
      capabilitySignature
    ) {
      return;
    }
    useAppSubsystemFrontendStore.setState({
      capabilities,
      status: "loaded",
      statusMessage: null,
      capabilitySignature,
      previewEnabled,
      registration: resolvedRegistration,
    });
  } catch (error) {
    if (
      useAppSubsystemFrontendStore.getState().capabilitySignature !==
      capabilitySignature
    ) {
      return;
    }
    clearPreviewEnabledSubscription();
    clearPendingAppSubsystemOperations(capabilitySignature);
    useAppSubsystemFrontendStore.setState({
      capabilities,
      status: "error",
      statusMessage: formatAppSubsystemFrontendLoadError(error),
      capabilitySignature,
      previewEnabled: false,
      registration: null,
    });
  }
}

export function resetAppSubsystemFrontendRuntimeState(): void {
  clearPreviewEnabledSubscription();
  clearPendingAppSubsystemOperations();
  useAppSubsystemFrontendStore.setState({
    ...INITIAL_APP_SUBSYSTEM_FRONTEND_STORE,
  });
}

export function getAppSubsystemFrontendRuntimeState(): AppSubsystemFrontendStore {
  return useAppSubsystemFrontendStore.getState();
}

export function useAppSubsystemFrontendStatus(): AppSubsystemFrontendStatus {
  return useAppSubsystemFrontendStore((state) => state.status);
}

export function useAppSubsystemFrontendStatusMessage(): string | null {
  return useAppSubsystemFrontendStore((state) => state.statusMessage);
}

export function useAppSubsystemOverviewTab(): AppSubsystemOverviewTabRegistration | null {
  return useAppSubsystemFrontendStore((state) => {
    if (
      !state.capabilities?.pluginEnabled ||
      !state.capabilities.appAuthoringUi
    ) {
      return null;
    }
    return state.registration?.overviewTab ?? null;
  });
}

export function useAppSubsystemPreviewSurface(): AppSubsystemPreviewSurfaceRegistration | null {
  return useAppSubsystemFrontendStore((state) => {
    if (
      !state.capabilities?.pluginEnabled ||
      !state.capabilities.appPreviewUi
    ) {
      return null;
    }
    return state.registration?.previewSurface ?? null;
  });
}

export function useAppSubsystemAppModeRoute(): AppSubsystemAppModeRouteRegistration | null {
  return useAppSubsystemFrontendStore((state) => {
    if (
      !state.capabilities?.pluginEnabled ||
      !state.capabilities.appDeploymentRuntime
    ) {
      return null;
    }
    return state.registration?.appModeRoute ?? null;
  });
}

export function useAppSubsystemAppDeploymentModal(): AppSubsystemAppDeploymentModalRegistration | null {
  return useAppSubsystemFrontendStore((state) => {
    if (
      !state.capabilities?.pluginEnabled ||
      !state.capabilities.appDeploymentRuntime
    ) {
      return null;
    }
    return state.registration?.appDeploymentModal ?? null;
  });
}

export function useAppSubsystemSlashCommands(): ChatSlashCommandDefinition[] {
  return useAppSubsystemFrontendStore((state) => {
    if (
      !state.capabilities?.pluginEnabled ||
      !state.capabilities.appGenerationChatModes
    ) {
      return EMPTY_APP_SUBSYSTEM_SLASH_COMMANDS;
    }
    return (
      state.registration?.slashCommands ?? EMPTY_APP_SUBSYSTEM_SLASH_COMMANDS
    );
  });
}

export function useAppSubsystemSupportedAppGenerationModes(): string[] {
  return useAppSubsystemFrontendStore((state) => {
    if (
      !state.capabilities?.pluginEnabled ||
      !state.capabilities.appGenerationChatModes
    ) {
      return EMPTY_APP_SUBSYSTEM_SUPPORTED_APP_GENERATION_MODES;
    }
    return collectSupportedAppGenerationModes(state.registration);
  });
}

export function appSubsystemModeRequiresImageAttachment(
  mode: string | null | undefined,
): boolean {
  if (typeof mode !== "string" || mode.trim().length === 0) {
    return false;
  }
  const state = useAppSubsystemFrontendStore.getState();
  if (
    !state.capabilities?.pluginEnabled ||
    !state.capabilities.appGenerationChatModes
  ) {
    return false;
  }
  return state.registration?.imageRequiredModes?.includes(mode) ?? false;
}

export function useAppSubsystemCustomSlashCommandModeOptions(): AppSubsystemCustomSlashCommandModeOption[] {
  return useAppSubsystemFrontendStore((state) => {
    if (
      !state.capabilities?.pluginEnabled ||
      !state.capabilities.appGenerationChatModes
    ) {
      return DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS;
    }
    return (
      state.registration?.customSlashCommandModes?.options ??
      DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS
    );
  });
}

export function useAppSubsystemDefaultCustomSlashCommandMode(): string {
  return useAppSubsystemFrontendStore((state) => {
    if (
      !state.capabilities?.pluginEnabled ||
      !state.capabilities.appGenerationChatModes
    ) {
      return DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE;
    }
    return (
      state.registration?.customSlashCommandModes?.defaultMode ??
      DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE
    );
  });
}

export function runAppSubsystemProjectResetHooks(): void {
  useAppSubsystemFrontendStore.getState().registration?.resetProjectState?.();
}

export function useAppSubsystemPreviewEnabled(): boolean {
  return useAppSubsystemFrontendStore((state) => state.previewEnabled);
}

function getAppSubsystemLoadedRegistration(): RegisteredAppSubsystemFrontendRegistration | null {
  const state = useAppSubsystemFrontendStore.getState();
  if (state.status !== "loaded") {
    return null;
  }
  return state.registration;
}

function queuedAppSubsystemOperationCapabilitySignature(): string | null {
  const state = useAppSubsystemFrontendStore.getState();
  if (
    state.status === "loading" &&
    hasFrontendSurfaceAvailability(state.capabilities) &&
    typeof state.capabilitySignature === "string" &&
    state.capabilitySignature.trim().length > 0
  ) {
    return state.capabilitySignature;
  }
  return null;
}

async function waitForLoadedAppSubsystemRegistration(): Promise<RegisteredAppSubsystemFrontendRegistration | null> {
  const loadedRegistration = getAppSubsystemLoadedRegistration();
  if (loadedRegistration) {
    return loadedRegistration;
  }
  const expectedCapabilitySignature =
    queuedAppSubsystemOperationCapabilitySignature();
  if (!expectedCapabilitySignature) {
    return null;
  }
  return new Promise((resolve) => {
    const unsubscribe = useAppSubsystemFrontendStore.subscribe((state) => {
      if (state.capabilitySignature !== expectedCapabilitySignature) {
        unsubscribe();
        resolve(null);
        return;
      }
      if (state.status === "loaded") {
        unsubscribe();
        resolve(state.registration);
        return;
      }
      if (
        state.status === "error" ||
        state.status === "unavailable" ||
        state.status === "idle"
      ) {
        unsubscribe();
        resolve(null);
      }
    });
  });
}

export function applyAppDefinitionStructuredContentToStore(
  structured: Record<string, unknown>,
): boolean {
  const registration = getAppSubsystemLoadedRegistration();
  if (registration?.applyAppDefinitionStructuredContentToStore) {
    return registration.applyAppDefinitionStructuredContentToStore(structured);
  }
  const capabilitySignature = queuedAppSubsystemOperationCapabilitySignature();
  if (!capabilitySignature) {
    return false;
  }
  enqueuePendingAppSubsystemOperation(capabilitySignature, {
    kind: "applyAppDefinitionStructuredContent",
    structured,
  });
  return true;
}

export function applyAppSpecPatchPreviewDeltaToStore(args: {
  toolCallId: string;
  previewValueDelta: string;
}): void {
  const registration = getAppSubsystemLoadedRegistration();
  if (registration?.applyAppSpecPatchPreviewDeltaToStore) {
    registration.applyAppSpecPatchPreviewDeltaToStore(args);
    return;
  }
  const capabilitySignature = queuedAppSubsystemOperationCapabilitySignature();
  if (!capabilitySignature) {
    return;
  }
  enqueuePendingAppSubsystemOperation(capabilitySignature, {
    kind: "applyAppSpecPatchPreviewDelta",
    args,
  });
}

export function clearAppSpecPatchPreviewStream(toolCallId: string): void {
  const registration = getAppSubsystemLoadedRegistration();
  if (registration?.clearAppSpecPatchPreviewStream) {
    registration.clearAppSpecPatchPreviewStream(toolCallId);
    return;
  }
  const capabilitySignature = queuedAppSubsystemOperationCapabilitySignature();
  if (!capabilitySignature) {
    return;
  }
  enqueuePendingAppSubsystemOperation(capabilitySignature, {
    kind: "clearAppSpecPatchPreviewStream",
    toolCallId,
  });
}

export function clearAllAppSpecPatchPreviewStreams(): void {
  const registration = getAppSubsystemLoadedRegistration();
  if (registration?.clearAllAppSpecPatchPreviewStreams) {
    registration.clearAllAppSpecPatchPreviewStreams();
    return;
  }
  const capabilitySignature = queuedAppSubsystemOperationCapabilitySignature();
  if (!capabilitySignature) {
    return;
  }
  enqueuePendingAppSubsystemOperation(capabilitySignature, {
    kind: "clearAllAppSpecPatchPreviewStreams",
  });
}

export async function initializeAppSessionFromCurrentDeployment(
  options: {
    forceNewSession?: boolean;
  } = {},
): Promise<boolean> {
  const registration =
    getAppSubsystemLoadedRegistration() ??
    (await waitForLoadedAppSubsystemRegistration());
  if (!registration?.initializeAppSessionFromCurrentDeployment) {
    return false;
  }
  return registration.initializeAppSessionFromCurrentDeployment(options);
}

export function resetAppSessionState(): void {
  const registration = getAppSubsystemLoadedRegistration();
  if (registration?.resetAppSessionState) {
    registration.resetAppSessionState();
    return;
  }
  const capabilitySignature = queuedAppSubsystemOperationCapabilitySignature();
  if (!capabilitySignature) {
    return;
  }
  enqueuePendingAppSubsystemOperation(capabilitySignature, {
    kind: "resetAppSessionState",
  });
}

export function processAppProjectStateUpdateFromBackend(
  payload: GetLatestProjectStateResponse,
): void {
  const registration = getAppSubsystemLoadedRegistration();
  if (registration?.processAppProjectStateUpdateFromBackend) {
    registration.processAppProjectStateUpdateFromBackend(payload);
    return;
  }
  const capabilitySignature = queuedAppSubsystemOperationCapabilitySignature();
  if (!capabilitySignature) {
    return;
  }
  enqueuePendingAppSubsystemOperation(capabilitySignature, {
    kind: "processAppProjectStateUpdate",
    payload,
  });
}

export function beginAppSubsystemFrontendRegistrationLoad(
  capabilities: AppSubsystemCapabilities | null,
  selectedProviderFrontendRefreshSignature?: string | null,
): void {
  const capabilitySignature = buildAppSubsystemCapabilitySignature(
    capabilities,
    selectedProviderFrontendRefreshSignature,
  );
  if (!hasFrontendSurfaceAvailability(capabilities)) {
    setUnavailableAppSubsystemFrontendState(capabilities, capabilitySignature);
    return;
  }
  if (
    shouldReuseLoadedRegistration(
      capabilities,
      capabilitySignature,
      useAppSubsystemFrontendStore.getState().registration,
    )
  ) {
    return;
  }
  setLoadingAppSubsystemFrontendState(capabilities, capabilitySignature, {
    clearPendingOperations: true,
  });
}
