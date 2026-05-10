import {
  runWithAppSubsystemFrontendHostRuntime,
  type AppSubsystemAppDeploymentModalRegistration,
  type AppSubsystemAppModeRouteRegistration,
  type AppSubsystemCustomSlashCommandModeOption,
  type AppSubsystemFrontendHost,
  type AppSubsystemOverviewTabRegistration,
  type AppSubsystemPreviewSurfaceRegistration,
  type RegisteredAppSubsystemFrontendRegistration,
} from "@setta/app-subsystem-frontend-sdk";

import type { ChatSlashCommandDefinition } from "components/Chat/chatComposerControls";

import type { GetLatestProjectStateResponse } from "openapi/http";

import {
  AppSubsystemCapabilities,
  AppSubsystemFrontendRegistrationsByPluginId,
  AppSubsystemFrontendStatus,
  AppSubsystemFrontendStore,
  DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE,
  DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
  EMPTY_APP_SUBSYSTEM_SLASH_COMMANDS,
  EMPTY_APP_SUBSYSTEM_SUPPORTED_APP_GENERATION_MODES,
  INITIAL_APP_SUBSYSTEM_FRONTEND_STORE,
  buildAppSubsystemCapabilityBaseKey,
  buildAppSubsystemCapabilitySignature,
  clearPendingAppSubsystemOperations,
  clearPreviewEnabledSubscription,
  collectSupportedAppGenerationModes,
  enqueuePendingAppSubsystemOperation,
  finalizeAppSubsystemFrontendRegistrationLoad,
  hasFrontendSurfaceAvailability,
  selectAppSubsystemFrontendRegistration,
  setLoadingAppSubsystemFrontendState,
  setUnavailableAppSubsystemFrontendState,
  shouldReuseLoadedRegistration,
  useAppSubsystemFrontendStore,
} from "./registrationValidation";

export async function syncAppSubsystemFrontendRegistration(
  capabilities: AppSubsystemCapabilities | null,
  registrationsByPluginId: AppSubsystemFrontendRegistrationsByPluginId,
  selectedProviderFrontendRefreshSignature?: string | null,
): Promise<void> {
  const currentState = useAppSubsystemFrontendStore.getState();
  const capabilitySignature = buildAppSubsystemCapabilitySignature(
    capabilities,
    selectedProviderFrontendRefreshSignature,
  );
  const pendingOperationQueueKey =
    buildAppSubsystemCapabilityBaseKey(capabilities);
  if (!hasFrontendSurfaceAvailability(capabilities)) {
    setUnavailableAppSubsystemFrontendState(capabilities, capabilitySignature);
    return;
  }
  if (
    currentState.status === "loading" &&
    currentState.capabilitySignature !== capabilitySignature
  ) {
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
    pendingOperationQueueKey,
  });
  finalizeAppSubsystemFrontendRegistrationLoad(
    capabilities,
    registration,
    capabilitySignature,
    pendingOperationQueueKey,
  );
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

function queuedAppSubsystemOperationQueueKey(): string | null {
  const state = useAppSubsystemFrontendStore.getState();
  if (
    state.status === "loading" &&
    hasFrontendSurfaceAvailability(state.capabilities) &&
    typeof state.pendingOperationQueueKey === "string" &&
    state.pendingOperationQueueKey.trim().length > 0
  ) {
    return state.pendingOperationQueueKey;
  }
  return null;
}

async function waitForLoadedAppSubsystemRegistration(): Promise<RegisteredAppSubsystemFrontendRegistration | null> {
  const loadedRegistration = getAppSubsystemLoadedRegistration();
  if (loadedRegistration) {
    return loadedRegistration;
  }
  const expectedQueueKey = queuedAppSubsystemOperationQueueKey();
  if (!expectedQueueKey) {
    return null;
  }
  return new Promise((resolve) => {
    const unsubscribe = useAppSubsystemFrontendStore.subscribe((state) => {
      if (state.pendingOperationQueueKey !== expectedQueueKey) {
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
  const queueKey = queuedAppSubsystemOperationQueueKey();
  if (!queueKey) {
    return false;
  }
  enqueuePendingAppSubsystemOperation(queueKey, {
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
  const queueKey = queuedAppSubsystemOperationQueueKey();
  if (!queueKey) {
    return;
  }
  enqueuePendingAppSubsystemOperation(queueKey, {
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
  const queueKey = queuedAppSubsystemOperationQueueKey();
  if (!queueKey) {
    return;
  }
  enqueuePendingAppSubsystemOperation(queueKey, {
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
  const queueKey = queuedAppSubsystemOperationQueueKey();
  if (!queueKey) {
    return;
  }
  enqueuePendingAppSubsystemOperation(queueKey, {
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
  return await runWithAppSubsystemFrontendHostRuntime(frontendHost, () =>
    registration.controller.initializeAppSessionFromCurrentDeployment(
      frontendHost,
      options,
    ),
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
  const queueKey = queuedAppSubsystemOperationQueueKey();
  if (!queueKey) {
    return;
  }
  enqueuePendingAppSubsystemOperation(queueKey, {
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
  const queueKey = queuedAppSubsystemOperationQueueKey();
  if (!queueKey) {
    return;
  }
  enqueuePendingAppSubsystemOperation(queueKey, {
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
  const pendingOperationQueueKey =
    buildAppSubsystemCapabilityBaseKey(capabilities);
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
    pendingOperationQueueKey,
  });
}
