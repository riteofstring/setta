import {
  type AppSubsystemAppDeploymentModalRegistration,
  type AppSubsystemAppModeRouteRegistration,
  type AppSubsystemCustomSlashCommandModeOption,
  type AppSubsystemFrontendHost,
  type AppSubsystemFrontendRegistration,
  type AppSubsystemOverviewTabRegistration,
  type AppSubsystemPatchPreviewDelta,
  type AppSubsystemPreviewSurfaceRegistration,
  type RegisteredAppSubsystemFrontendRegistration,
} from "@setta/app-subsystem-frontend-sdk";
import type { ChatSlashCommandDefinition } from "components/Chat/chatComposerControls";
import type { GetLatestProjectStateResponse } from "openapi/http";
import { PluginRuntimeResponse } from "utils/generatedTypes";
import { createWithEqualityFn } from "zustand/traditional";

export {
  buildDefaultAppSpecPath,
  createAppSubsystemFrontendHost,
  isAppSubsystemFrontendRegistration,
} from "@setta/app-subsystem-frontend-sdk";
export type { AppSubsystemRenderer } from "@setta/app-subsystem-frontend-sdk";

type AppSubsystemCapabilities = NonNullable<
  PluginRuntimeResponse["featureCapabilities"]
>["appSubsystem"];

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
  | { kind: "resetAppSessionState"; host: AppSubsystemFrontendHost };

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
  chat: AppSubsystemChatRegistration | null,
): string[] {
  if (chat === null) {
    return EMPTY_APP_SUBSYSTEM_SUPPORTED_APP_GENERATION_MODES;
  }
  const seenModes = new Set<string>();
  const modes: string[] = [];
  for (const command of chat.slashCommands ?? []) {
    appendSupportedAppGenerationMode(
      modes,
      seenModes,
      command.appGenerationMode,
    );
  }
  for (const option of chat.customSlashCommandModes?.options ?? []) {
    appendSupportedAppGenerationMode(modes, seenModes, option.id, true);
  }
  appendSupportedAppGenerationMode(
    modes,
    seenModes,
    chat.customSlashCommandModes?.defaultMode,
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

function formatAppSubsystemFrontendLoadError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to resolve app subsystem frontend registration.";
}

function bindPreviewEnabledRegistration(
  registration: AppSubsystemFrontendRegistration,
): boolean {
  const controller = registration.controller;
  clearPreviewEnabledSubscription();
  const previewEnabled = controller?.getPreviewEnabled?.() ?? false;
  if (!controller?.subscribePreviewEnabled) {
    return previewEnabled;
  }
  appSubsystemPreviewEnabledUnsubscribe = controller.subscribePreviewEnabled(
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
    registration.controller?.applyAppDefinitionStructuredContentToStore?.(
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
    registration.controller?.applyAppSpecPatchPreviewDeltaToStore?.(
      operation.args,
    );
  },
  clearAppSpecPatchPreviewStream: (
    registration: AppSubsystemFrontendRegistration,
    operation: Extract<
      AppSubsystemPendingOperation,
      { kind: "clearAppSpecPatchPreviewStream" }
    >,
  ): void => {
    registration.controller?.clearAppSpecPatchPreviewStream?.(
      operation.toolCallId,
    );
  },
  clearAllAppSpecPatchPreviewStreams: (
    registration: AppSubsystemFrontendRegistration,
  ): void => {
    registration.controller?.clearAllAppSpecPatchPreviewStreams?.();
  },
  processAppProjectStateUpdate: (
    registration: AppSubsystemFrontendRegistration,
    operation: Extract<
      AppSubsystemPendingOperation,
      { kind: "processAppProjectStateUpdate" }
    >,
  ): void => {
    registration.controller?.processAppProjectStateUpdateFromBackend?.(
      operation.payload,
    );
  },
  resetAppSessionState: (
    registration: AppSubsystemFrontendRegistration,
    operation: Extract<
      AppSubsystemPendingOperation,
      { kind: "resetAppSessionState" }
    >,
  ): void => {
    registration.controller?.resetAppSessionState?.(operation.host);
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
  useAppSubsystemFrontendStore
    .getState()
    .registration?.controller?.resetProjectState?.();
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
    currentState.registration?.controller?.resetProjectState?.();
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

type AppSubsystemCapabilityRequirement = {
  required: boolean | undefined;
  present: boolean;
  message: string;
};

type AppSubsystemFrontendCapabilityFlag = keyof Pick<
  AppSubsystemCapabilities,
  | "appAuthoringUi"
  | "appPreviewUi"
  | "appGenerationChatModes"
  | "appDeploymentRuntime"
>;

function getAppSubsystemCapabilityFlag(
  capabilities: AppSubsystemCapabilities | null,
  key: AppSubsystemFrontendCapabilityFlag,
): boolean | undefined {
  return capabilities?.[key];
}

function hasAppSubsystemSlashCommands(
  chat: AppSubsystemChatRegistration | undefined,
): boolean {
  return (chat?.slashCommands.length ?? 0) > 0;
}

function hasAppSubsystemCustomSlashCommandModes(
  chat: AppSubsystemChatRegistration | undefined,
): boolean {
  return Boolean(chat?.customSlashCommandModes);
}

function validateFrontendRegistrationCapabilities(
  registration: AppSubsystemFrontendRegistration,
  capabilities: AppSubsystemCapabilities | null,
): void {
  const requirements: AppSubsystemCapabilityRequirement[] = [
    {
      required: getAppSubsystemCapabilityFlag(capabilities, "appAuthoringUi"),
      present: Boolean(registration.overviewTab),
      message:
        "App subsystem frontend adapter is missing the authoring overview registration.",
    },
    {
      required: getAppSubsystemCapabilityFlag(capabilities, "appPreviewUi"),
      present: Boolean(registration.previewSurface),
      message:
        "App subsystem frontend adapter is missing the preview surface registration.",
    },
    {
      required: getAppSubsystemCapabilityFlag(
        capabilities,
        "appGenerationChatModes",
      ),
      present: hasAppSubsystemSlashCommands(registration.chat),
      message:
        "App subsystem frontend adapter is missing slash command registrations.",
    },
    {
      required: getAppSubsystemCapabilityFlag(
        capabilities,
        "appGenerationChatModes",
      ),
      present: hasAppSubsystemCustomSlashCommandModes(registration.chat),
      message:
        "App subsystem frontend adapter is missing custom slash-command mode registrations.",
    },
    {
      required: getAppSubsystemCapabilityFlag(
        capabilities,
        "appDeploymentRuntime",
      ),
      present: Boolean(registration.appModeRoute),
      message:
        "App subsystem frontend adapter is missing the app mode route registration.",
    },
    {
      required: getAppSubsystemCapabilityFlag(
        capabilities,
        "appDeploymentRuntime",
      ),
      present: Boolean(registration.appDeploymentModal),
      message:
        "App subsystem frontend adapter is missing the app deployment modal registration.",
    },
  ];
  for (const requirement of requirements) {
    requireCapabilityRegistration(
      requirement.required,
      requirement.present,
      requirement.message,
    );
  }
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
    resolvedRegistration.controller?.initializeProjectState?.();
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
      state.registration?.chat?.slashCommands ??
      EMPTY_APP_SUBSYSTEM_SLASH_COMMANDS
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
    return collectSupportedAppGenerationModes(state.registration?.chat ?? null);
  });
}

function hasAppSubsystemChatCapability(
  capabilities: AppSubsystemCapabilities | null,
): boolean {
  return Boolean(
    capabilities?.pluginEnabled && capabilities.appGenerationChatModes,
  );
}

export function appSubsystemModeRequiresImageAttachment(
  mode: string | null | undefined,
): boolean {
  const normalizedMode = mode?.trim() ?? "";
  if (normalizedMode.length === 0) {
    return false;
  }
  const state = useAppSubsystemFrontendStore.getState();
  if (!hasAppSubsystemChatCapability(state.capabilities)) {
    return false;
  }
  return (
    state.registration?.chat?.imageRequiredModes?.includes(normalizedMode) ??
    false
  );
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
      state.registration?.chat?.customSlashCommandModes?.options ??
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
      state.registration?.chat?.customSlashCommandModes?.defaultMode ??
      DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE
    );
  });
}

export function runAppSubsystemProjectResetHooks(): void {
  useAppSubsystemFrontendStore
    .getState()
    .registration?.controller?.resetProjectState?.();
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
  if (registration?.controller?.applyAppDefinitionStructuredContentToStore) {
    return registration.controller.applyAppDefinitionStructuredContentToStore(
      structured,
    );
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
  if (registration?.controller?.applyAppSpecPatchPreviewDeltaToStore) {
    registration.controller.applyAppSpecPatchPreviewDeltaToStore(args);
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
  if (registration?.controller?.clearAppSpecPatchPreviewStream) {
    registration.controller.clearAppSpecPatchPreviewStream(toolCallId);
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
  if (registration?.controller?.clearAllAppSpecPatchPreviewStreams) {
    registration.controller.clearAllAppSpecPatchPreviewStreams();
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
  frontendHost: AppSubsystemFrontendHost,
  options: {
    forceNewSession?: boolean;
  } = {},
): Promise<boolean> {
  const registration =
    getAppSubsystemLoadedRegistration() ??
    (await waitForLoadedAppSubsystemRegistration());
  if (!registration?.controller?.initializeAppSessionFromCurrentDeployment) {
    return false;
  }
  return registration.controller.initializeAppSessionFromCurrentDeployment(
    frontendHost,
    options,
  );
}

export function resetAppSessionState(
  frontendHost: AppSubsystemFrontendHost,
): void {
  const registration = getAppSubsystemLoadedRegistration();
  if (registration?.controller?.resetAppSessionState) {
    registration.controller.resetAppSessionState(frontendHost);
    return;
  }
  const capabilitySignature = queuedAppSubsystemOperationCapabilitySignature();
  if (!capabilitySignature) {
    return;
  }
  enqueuePendingAppSubsystemOperation(capabilitySignature, {
    kind: "resetAppSessionState",
    host: frontendHost,
  });
}

export function processAppProjectStateUpdateFromBackend(
  payload: GetLatestProjectStateResponse,
): void {
  const registration = getAppSubsystemLoadedRegistration();
  if (registration?.controller?.processAppProjectStateUpdateFromBackend) {
    registration.controller.processAppProjectStateUpdateFromBackend(payload);
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
