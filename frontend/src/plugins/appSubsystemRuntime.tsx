import type { ChatSlashCommandDefinition } from "components/Chat/chatComposerControls";
import type appSubsystemFrontendRegistrationExport from "plugins/appSubsystemHostAdapter";
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

type AppSubsystemFrontendRegistration = {
  overviewTab?: AppSubsystemOverviewTabRegistration;
  previewSurface?: AppSubsystemPreviewSurfaceRegistration;
  appModeRoute?: AppSubsystemAppModeRouteRegistration;
  appDeploymentModal?: AppSubsystemAppDeploymentModalRegistration;
  slashCommands?: ChatSlashCommandDefinition[];
  imageRequiredModes?: string[];
  customSlashCommandModes?: AppSubsystemCustomSlashCommandModesRegistration;
  initializeProjectState?: () => void;
  resetProjectState?: () => void;
};

type AppSubsystemFrontendAdapterModule = {
  default?: typeof appSubsystemFrontendRegistrationExport;
  appSubsystemFrontendRegistration?: typeof appSubsystemFrontendRegistrationExport;
};

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
  registration: AppSubsystemFrontendRegistration | null;
};

const INITIAL_APP_SUBSYSTEM_FRONTEND_STORE: AppSubsystemFrontendStore = {
  capabilities: null,
  status: "idle",
  statusMessage: null,
  capabilitySignature: null,
  registration: null,
};
const EMPTY_APP_SUBSYSTEM_SLASH_COMMANDS: ChatSlashCommandDefinition[] = [];
const DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE = "plain_chat";
const DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS: AppSubsystemCustomSlashCommandModeOption[] =
  [{ id: DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE, name: "Plain chat" }];

let appSubsystemFrontendLoadSequence = 0;

export const useAppSubsystemFrontendStore =
  createWithEqualityFn<AppSubsystemFrontendStore>(() => ({
    ...INITIAL_APP_SUBSYSTEM_FRONTEND_STORE,
  }));

function buildAppSubsystemCapabilitySignature(
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

const APP_SUBSYSTEM_FRONTEND_REGISTRATION_VALIDATORS = [
  ["overviewTab", isOverviewTabRegistration],
  ["previewSurface", isPreviewSurfaceRegistration],
  ["appModeRoute", isAppModeRouteRegistration],
  ["appDeploymentModal", isAppDeploymentModalRegistration],
  ["slashCommands", isSlashCommandRegistration],
  ["imageRequiredModes", isImageRequiredModeRegistration],
  ["customSlashCommandModes", isCustomSlashCommandModeRegistration],
] as const;

function isFrontendRegistration(
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
  return (
    hasOptionalFunction(value, "initializeProjectState") &&
    hasOptionalFunction(value, "resetProjectState")
  );
}

function formatAppSubsystemFrontendLoadError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load app subsystem frontend registration.";
}

function setUnavailableAppSubsystemFrontendState(
  capabilities: AppSubsystemCapabilities | null,
  capabilitySignature: string,
): void {
  useAppSubsystemFrontendStore.getState().registration?.resetProjectState?.();
  appSubsystemFrontendLoadSequence += 1;
  useAppSubsystemFrontendStore.setState({
    capabilities,
    status: "unavailable",
    statusMessage: null,
    capabilitySignature,
    registration: null,
  });
}

function shouldReuseLoadedRegistration(
  capabilities: AppSubsystemCapabilities | null,
  capabilitySignature: string,
): boolean {
  const currentState = useAppSubsystemFrontendStore.getState();
  if (
    currentState.status !== "loaded" ||
    currentState.registration === null ||
    currentState.capabilitySignature !== capabilitySignature
  ) {
    return false;
  }
  useAppSubsystemFrontendStore.setState((state) => ({
    ...state,
    capabilities,
  }));
  return true;
}

function requireFrontendRegistration(module: {
  default?: unknown;
  appSubsystemFrontendRegistration?: unknown;
}): AppSubsystemFrontendRegistration {
  const candidate =
    module.default ?? module.appSubsystemFrontendRegistration ?? null;
  if (!isFrontendRegistration(candidate)) {
    throw new Error(
      "App subsystem frontend adapter did not export a valid registration.",
    );
  }
  return candidate;
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

function resolveFrontendRegistrationFromModule(
  module: {
    default?: unknown;
    appSubsystemFrontendRegistration?: unknown;
  },
  capabilities: AppSubsystemCapabilities | null,
): AppSubsystemFrontendRegistration {
  const registration = requireFrontendRegistration(module);
  validateFrontendRegistrationCapabilities(registration, capabilities);
  return registration;
}

export async function syncAppSubsystemFrontendRegistration(
  capabilities: AppSubsystemCapabilities | null,
): Promise<void> {
  const capabilitySignature =
    buildAppSubsystemCapabilitySignature(capabilities);
  if (!hasFrontendSurfaceAvailability(capabilities)) {
    setUnavailableAppSubsystemFrontendState(capabilities, capabilitySignature);
    return;
  }

  if (shouldReuseLoadedRegistration(capabilities, capabilitySignature)) {
    return;
  }

  const loadSequence = appSubsystemFrontendLoadSequence + 1;
  appSubsystemFrontendLoadSequence = loadSequence;

  useAppSubsystemFrontendStore.setState({
    capabilities,
    status: "loading",
    statusMessage: null,
    capabilitySignature,
    registration: null,
  });

  try {
    const module = (await import(
      "plugins/appSubsystemHostAdapter"
    )) as AppSubsystemFrontendAdapterModule;
    if (loadSequence !== appSubsystemFrontendLoadSequence) {
      return;
    }
    const registration = resolveFrontendRegistrationFromModule(
      module,
      capabilities,
    );
    registration.initializeProjectState?.();
    useAppSubsystemFrontendStore.setState({
      capabilities,
      status: "loaded",
      statusMessage: null,
      capabilitySignature,
      registration,
    });
  } catch (error) {
    if (loadSequence !== appSubsystemFrontendLoadSequence) {
      return;
    }
    useAppSubsystemFrontendStore.setState({
      capabilities,
      status: "error",
      statusMessage: formatAppSubsystemFrontendLoadError(error),
      capabilitySignature,
      registration: null,
    });
  }
}

export function resetAppSubsystemFrontendRuntimeState(): void {
  appSubsystemFrontendLoadSequence += 1;
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
