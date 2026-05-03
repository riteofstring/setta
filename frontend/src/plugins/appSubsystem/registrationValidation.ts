import {
  AppSubsystemChatUIConfig,
  type AppSubsystemChatRegistration,
  type AppSubsystemCustomSlashCommandModeOption,
  type AppSubsystemFrontendHost,
  type AppSubsystemFrontendRegistration,
  type AppSubsystemPatchPreviewDelta,
  type RegisteredAppSubsystemFrontendRegistration,
} from "@setta/app-subsystem-frontend-sdk";

import type { ChatSlashCommandDefinition } from "components/Chat/chatComposerControls";

import type { GetLatestProjectStateResponse } from "openapi/http";

import { PluginRuntimeResponse } from "utils/generatedTypes";

import { createWithEqualityFn } from "zustand/traditional";

export type AppSubsystemCapabilities = NonNullable<
  PluginRuntimeResponse["featureCapabilities"]
>["appSubsystem"];

export type AppSubsystemFrontendRegistrationsByPluginId = Record<
  string,
  RegisteredAppSubsystemFrontendRegistration
>;

export type AppSubsystemFrontendStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "unavailable"
  | "error";

export type AppSubsystemFrontendStore = {
  capabilities: AppSubsystemCapabilities | null;
  status: AppSubsystemFrontendStatus;
  statusMessage: string | null;
  capabilitySignature: string | null;
  pendingOperationQueueKey: string | null;
  previewEnabled: boolean;
  registration: RegisteredAppSubsystemFrontendRegistration | null;
};

export const INITIAL_APP_SUBSYSTEM_FRONTEND_STORE: AppSubsystemFrontendStore = {
  capabilities: null,
  status: "idle",
  statusMessage: null,
  capabilitySignature: null,
  pendingOperationQueueKey: null,
  previewEnabled: false,
  registration: null,
};

export const EMPTY_APP_SUBSYSTEM_SLASH_COMMANDS: ChatSlashCommandDefinition[] =
  [];

export const EMPTY_APP_SUBSYSTEM_SUPPORTED_APP_GENERATION_MODES: string[] = [];

export const DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE = "plain_chat";

export const DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS: AppSubsystemCustomSlashCommandModeOption[] =
  [{ id: DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE, name: "Plain chat" }];

export const APP_SUBSYSTEM_CHAT_COMMAND_BY_ACTION = new Map(
  AppSubsystemChatUIConfig.slashCommands.map((command) => [
    command.action,
    command,
  ]),
);

export const APP_SUBSYSTEM_CUSTOM_SLASH_MODE_BY_ID = new Map(
  AppSubsystemChatUIConfig.customSlashCommandModeOptions.map((option) => [
    option.value,
    option,
  ]),
);

export const APP_SUBSYSTEM_IMAGE_REQUIRED_MODE_IDS = new Set(
  AppSubsystemChatUIConfig.customSlashCommandModeOptions
    .filter((option) => option.requiresImageAttachment)
    .map((option) => option.value),
);

export let appSubsystemPreviewEnabledUnsubscribe: (() => void) | null = null;

export type AppSubsystemPendingOperation =
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

export const pendingAppSubsystemOperationsByQueueKey = new Map<
  string,
  AppSubsystemPendingOperation[]
>();

export const useAppSubsystemFrontendStore =
  createWithEqualityFn<AppSubsystemFrontendStore>(() => ({
    ...INITIAL_APP_SUBSYSTEM_FRONTEND_STORE,
  }));

export function buildAppSubsystemCapabilityBaseKey(
  capabilities: AppSubsystemCapabilities | null,
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
  ].join(":");
}

export function buildAppSubsystemCapabilitySignature(
  capabilities: AppSubsystemCapabilities | null,
  selectedProviderFrontendRefreshSignature?: string | null,
): string {
  const capabilityBaseKey = buildAppSubsystemCapabilityBaseKey(capabilities);
  if (capabilityBaseKey.length === 0) {
    return "";
  }
  return [
    capabilityBaseKey,
    selectedProviderFrontendRefreshSignature?.trim() ?? "",
  ].join(":");
}

export function hasFrontendSurfaceAvailability(
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

export function appendSupportedAppGenerationMode(
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

export function collectSupportedAppGenerationModes(
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

export function quotedPluginIDs(pluginIDs: string[] | undefined): string {
  const normalized = (pluginIDs ?? [])
    .map((pluginID) => pluginID.trim())
    .filter((pluginID) => pluginID.length > 0)
    .sort();
  if (normalized.length === 0) {
    return "none";
  }
  return normalized.map((pluginID) => `"${pluginID}"`).join(", ");
}

export function buildProviderListUnavailableMessage(
  reason: string,
  pluginIDs: string[] | undefined,
  suffix = ".",
): string {
  return `App mode is unavailable because ${reason}: ${quotedPluginIDs(pluginIDs)}${suffix}`;
}

export function buildSelectedProviderMissingDeploymentRuntimeMessage(
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

export function clearPendingAppSubsystemOperations(
  queueKey?: string | null,
): void {
  if (!queueKey) {
    pendingAppSubsystemOperationsByQueueKey.clear();
    return;
  }
  pendingAppSubsystemOperationsByQueueKey.delete(queueKey);
}

export function enqueuePendingAppSubsystemOperation(
  queueKey: string,
  operation: AppSubsystemPendingOperation,
): void {
  if (queueKey.trim().length === 0) {
    return;
  }
  const queuedOperations =
    pendingAppSubsystemOperationsByQueueKey.get(queueKey);
  if (queuedOperations) {
    queuedOperations.push(operation);
    return;
  }
  pendingAppSubsystemOperationsByQueueKey.set(queueKey, [operation]);
}

export function clearPreviewEnabledSubscription(): void {
  if (!appSubsystemPreviewEnabledUnsubscribe) {
    return;
  }
  appSubsystemPreviewEnabledUnsubscribe();
  appSubsystemPreviewEnabledUnsubscribe = null;
}

export function applyPreviewEnabledState(previewEnabled: boolean): void {
  useAppSubsystemFrontendStore.setState((state) =>
    state.previewEnabled === previewEnabled
      ? state
      : {
          ...state,
          previewEnabled,
        },
  );
}

export function formatAppSubsystemFrontendLoadError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to resolve app subsystem frontend registration.";
}

export function bindPreviewEnabledRegistration(
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

export const APP_SUBSYSTEM_PENDING_OPERATION_APPLIERS = {
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

export function applyPendingAppSubsystemOperation(
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

export function flushPendingAppSubsystemOperations(
  registration: AppSubsystemFrontendRegistration,
  queueKey: string,
): void {
  if (
    pendingAppSubsystemOperationsByQueueKey.size === 0 ||
    queueKey.trim().length === 0
  ) {
    return;
  }
  const operations = pendingAppSubsystemOperationsByQueueKey.get(queueKey);
  if (!operations || operations.length === 0) {
    return;
  }
  clearPendingAppSubsystemOperations(queueKey);
  for (const operation of operations) {
    applyPendingAppSubsystemOperation(registration, operation);
  }
}

export function setUnavailableAppSubsystemFrontendState(
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
    pendingOperationQueueKey: null,
    previewEnabled: false,
    registration: null,
  });
}

export function shouldResetProjectStateForFrontendLoad(
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

export function setLoadingAppSubsystemFrontendState(
  capabilities: AppSubsystemCapabilities | null,
  capabilitySignature: string,
  options: {
    clearPendingOperations: boolean;
    pendingOperationQueueKey: string;
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
      pendingOperationQueueKey: options.pendingOperationQueueKey,
    }));
    return;
  }
  clearPreviewEnabledSubscription();
  if (
    options.clearPendingOperations &&
    currentState.pendingOperationQueueKey !== options.pendingOperationQueueKey
  ) {
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
    pendingOperationQueueKey: options.pendingOperationQueueKey,
    previewEnabled: false,
    registration: null,
  });
}

export function shouldReuseLoadedRegistration(
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

export function requireCapabilityRegistration(
  required: boolean | undefined,
  present: boolean,
  message: string,
): void {
  if (required && !present) {
    throw new Error(message);
  }
}

export type AppSubsystemCapabilityRequirement = {
  required: boolean | undefined;
  present: boolean;
  message: string;
};

export type AppSubsystemFrontendCapabilityFlag = keyof Pick<
  AppSubsystemCapabilities,
  | "appAuthoringUi"
  | "appPreviewUi"
  | "appGenerationChatModes"
  | "appDeploymentRuntime"
>;

export function getAppSubsystemCapabilityFlag(
  capabilities: AppSubsystemCapabilities | null,
  key: AppSubsystemFrontendCapabilityFlag,
): boolean | undefined {
  return capabilities?.[key];
}

export function hasAppSubsystemSlashCommands(
  chat: AppSubsystemChatRegistration | undefined,
): boolean {
  return (chat?.slashCommands.length ?? 0) > 0;
}

export function hasAppSubsystemCustomSlashCommandModes(
  chat: AppSubsystemChatRegistration | undefined,
): boolean {
  return Boolean(chat?.customSlashCommandModes);
}

export function requireNonEmptyAppGenerationString(
  value: string | null | undefined,
  message: string,
): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw new Error(message);
  }
  return normalized;
}

export function validateAppGenerationSlashCommandRegistration(
  command: AppSubsystemChatRegistration["slashCommands"][number],
): void {
  const action = requireNonEmptyAppGenerationString(
    command.action,
    "App subsystem frontend adapter registered an app-generation slash command without an action.",
  );
  const expected = APP_SUBSYSTEM_CHAT_COMMAND_BY_ACTION.get(action);
  if (!expected) {
    throw new Error(
      `App subsystem frontend adapter registered unsupported app-generation slash command action ${JSON.stringify(action)}.`,
    );
  }

  const commandName = requireNonEmptyAppGenerationString(
    command.command,
    `App subsystem frontend adapter slash command action ${JSON.stringify(action)} is missing a command.`,
  );
  if (commandName !== expected.command) {
    throw new Error(
      `App subsystem frontend adapter slash command action ${JSON.stringify(action)} must use command ${JSON.stringify(expected.command)}.`,
    );
  }

  const mode = requireNonEmptyAppGenerationString(
    command.appGenerationMode,
    `App subsystem frontend adapter slash command ${commandName} is missing appGenerationMode.`,
  );
  if (mode !== expected.appGenerationMode) {
    throw new Error(
      `App subsystem frontend adapter slash command ${commandName} declares unsupported appGenerationMode ${JSON.stringify(mode)}.`,
    );
  }

  const promptTemplate = requireNonEmptyAppGenerationString(
    command.promptTemplate,
    `App subsystem frontend adapter slash command ${commandName} is missing promptTemplate.`,
  );
  if (promptTemplate !== expected.promptTemplate) {
    throw new Error(
      `App subsystem frontend adapter slash command ${commandName} must use the Go-owned promptTemplate for ${JSON.stringify(mode)}.`,
    );
  }

  const summary = requireNonEmptyAppGenerationString(
    command.summary,
    `App subsystem frontend adapter slash command ${commandName} is missing summary.`,
  );
  if (summary !== expected.summary) {
    throw new Error(
      `App subsystem frontend adapter slash command ${commandName} must use the Go-owned summary for ${JSON.stringify(mode)}.`,
    );
  }

  const expectedRequiresImage = APP_SUBSYSTEM_IMAGE_REQUIRED_MODE_IDS.has(
    expected.appGenerationMode,
  );
  if (
    command.requiresImageAttachment !== undefined &&
    command.requiresImageAttachment !== expectedRequiresImage
  ) {
    throw new Error(
      `App subsystem frontend adapter slash command ${commandName} declares image requirements that do not match ${JSON.stringify(mode)}.`,
    );
  }
}

export function validateAppGenerationCustomModeOption(
  option: AppSubsystemCustomSlashCommandModeOption,
): void {
  const mode = requireNonEmptyAppGenerationString(
    option.id,
    "App subsystem frontend adapter registered a custom slash-command mode without an id.",
  );
  const expected = APP_SUBSYSTEM_CUSTOM_SLASH_MODE_BY_ID.get(mode);
  if (!expected) {
    throw new Error(
      `App subsystem frontend adapter registered unsupported custom slash-command mode ${JSON.stringify(mode)}.`,
    );
  }
  if (option.name !== expected.label) {
    throw new Error(
      `App subsystem frontend adapter custom slash-command mode ${JSON.stringify(mode)} must use label ${JSON.stringify(expected.label)}.`,
    );
  }
}

export function validateAppGenerationChatRegistration(
  chat: AppSubsystemChatRegistration | undefined,
): void {
  if (!chat) {
    return;
  }
  for (const command of chat.slashCommands) {
    validateAppGenerationSlashCommandRegistration(command);
  }
  for (const option of chat.customSlashCommandModes.options) {
    validateAppGenerationCustomModeOption(option);
  }
  const defaultMode = requireNonEmptyAppGenerationString(
    chat.customSlashCommandModes.defaultMode,
    "App subsystem frontend adapter custom slash-command modes are missing a defaultMode.",
  );
  if (!APP_SUBSYSTEM_CUSTOM_SLASH_MODE_BY_ID.has(defaultMode)) {
    throw new Error(
      `App subsystem frontend adapter custom slash-command defaultMode ${JSON.stringify(defaultMode)} is unsupported.`,
    );
  }
  for (const mode of chat.imageRequiredModes) {
    if (!APP_SUBSYSTEM_IMAGE_REQUIRED_MODE_IDS.has(mode)) {
      throw new Error(
        `App subsystem frontend adapter registered unsupported image-required appGenerationMode ${JSON.stringify(mode)}.`,
      );
    }
  }
}

export function validateFrontendRegistrationCapabilities(
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
    {
      required: getAppSubsystemCapabilityFlag(
        capabilities,
        "appDeploymentRuntime",
      ),
      present: Boolean(
        registration.controller?.initializeAppSessionFromCurrentDeployment,
      ),
      message:
        "App subsystem frontend adapter is missing the app deployment initialization controller.",
    },
  ];
  for (const requirement of requirements) {
    requireCapabilityRegistration(
      requirement.required,
      requirement.present,
      requirement.message,
    );
  }
  if (getAppSubsystemCapabilityFlag(capabilities, "appGenerationChatModes")) {
    validateAppGenerationChatRegistration(registration.chat);
  }
}

export function buildMissingFrontendRegistrationMessage(
  capabilities: AppSubsystemCapabilities | null,
): string {
  if (!capabilities?.pluginId) {
    return "The active app subsystem provider did not register frontend surfaces through the plugin host.";
  }
  return `App subsystem provider ${capabilities.pluginId} did not register frontend surfaces through the plugin host.`;
}

export function selectAppSubsystemFrontendRegistration(
  capabilities: AppSubsystemCapabilities | null,
  registrationsByPluginId: AppSubsystemFrontendRegistrationsByPluginId,
): RegisteredAppSubsystemFrontendRegistration | null {
  if (capabilities?.pluginId?.trim() === "") {
    return null;
  }
  return registrationsByPluginId[capabilities.pluginId] ?? null;
}

export function requireAppSubsystemFrontendRegistration(
  capabilities: AppSubsystemCapabilities | null,
  registration: RegisteredAppSubsystemFrontendRegistration | null,
): RegisteredAppSubsystemFrontendRegistration {
  if (registration !== null) {
    return registration;
  }
  throw new Error(buildMissingFrontendRegistrationMessage(capabilities));
}

export function finalizeAppSubsystemFrontendRegistrationLoad(
  capabilities: AppSubsystemCapabilities | null,
  registration: RegisteredAppSubsystemFrontendRegistration | null,
  capabilitySignature: string,
  pendingOperationQueueKey: string,
): void {
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
      pendingOperationQueueKey,
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
      pendingOperationQueueKey,
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
    clearPendingAppSubsystemOperations(pendingOperationQueueKey);
    useAppSubsystemFrontendStore.setState({
      capabilities,
      status: "error",
      statusMessage: formatAppSubsystemFrontendLoadError(error),
      capabilitySignature,
      pendingOperationQueueKey: null,
      previewEnabled: false,
      registration: null,
    });
  }
}
