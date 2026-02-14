import _ from "lodash";
import { useEffect } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState, useShareSession } from "state/definitions";
import { C_ADDRESSES } from "utils/c_addresses";
import { buildPluginPaneOverviewTabName } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_plugins_list,
  route_plugins_status,
} from "utils/generatedEndpoints";
import {
  PluginBlockedCapability,
  PluginListEntry,
  PluginListResponse,
  PluginRestartCapability,
  PluginRuntimeStateEnum,
  PluginStatusEntry,
  PluginStatusResponse,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { createWithEqualityFn } from "zustand/traditional";
import {
  isPluginPaneIconName,
  PluginPaneIconNameEnum,
  type PluginPaneIconName,
} from "./paneIcons";

export { type PluginPaneIconName } from "./paneIcons";

const PLUGIN_FRONTEND_API_VERSION = 1;

export const PluginFrontendErrorCodeEnum = {
  RegistrationInvalid: "PLUGIN_FRONTEND_REGISTRATION_INVALID",
  ApiVersionMismatch: "PLUGIN_FRONTEND_API_VERSION_MISMATCH",
  CapabilityDenied: "PLUGIN_CAPABILITY_DENIED",
  FrontendLoadFailed: "PLUGIN_FRONTEND_LOAD_FAILED",
} as const;

type PluginFrontendErrorCode =
  (typeof PluginFrontendErrorCodeEnum)[keyof typeof PluginFrontendErrorCodeEnum];

export const PluginSectionFallbackReasonEnum = {
  plugin_disabled: "plugin_disabled",
  plugin_not_installed: "plugin_not_installed",
  frontend_load_failed: "frontend_load_failed",
  mode_blocked: "mode_blocked",
} as const;

type PluginSectionFallbackReason =
  (typeof PluginSectionFallbackReasonEnum)[keyof typeof PluginSectionFallbackReasonEnum];

type PluginServerMode = "ide" | "share" | "app";

type PluginSectionProps = {
  sectionId: string;
  pluginId: string;
  kind: string;
  data: Record<string, unknown>;
  readOnly: boolean;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
};

type PluginSectionRenderer = {
  mount: (el: HTMLElement, props: PluginSectionProps) => void;
  update?: (el: HTMLElement, props: PluginSectionProps) => void;
  unmount?: (el: HTMLElement) => void;
};

type PluginSectionKindDefinition = {
  kind: string;
  title: string;
  description?: string;
  initialData?: Record<string, unknown>;
  renderer: PluginSectionRenderer;
};

export type RegisteredPluginSectionKind = PluginSectionKindDefinition & {
  pluginId: string;
};

type PluginPaneProps = {
  pluginId: string;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
};

type PluginPaneRenderer = {
  mount: (el: HTMLElement, props: PluginPaneProps) => void;
  update?: (el: HTMLElement, props: PluginPaneProps) => void;
  unmount?: (el: HTMLElement) => void;
};

type PluginPaneDefinition = {
  id: string;
  title: string;
  description?: string;
  icon?: PluginPaneIconName;
  renderer: PluginPaneRenderer;
};

export type RegisteredPluginPane = PluginPaneDefinition & {
  pluginId: string;
};

type PluginCommandDefinition = {
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
};

export type RegisteredPluginCommand = PluginCommandDefinition & {
  pluginId: string;
};

export type PluginPaneTabEntry = {
  tabKey: string;
  pluginId: string;
  paneId: string;
  title: string;
  description?: string;
  icon?: PluginPaneIconName;
};

type PluginFrontendError = {
  code: PluginFrontendErrorCode;
  message: string;
};

type PluginProjectContext = {
  projectConfigId: string;
  serverMode: PluginServerMode;
};

type SettaPluginHost = {
  apiVersion: number;
  pluginId: string;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
  registerSectionKind: (definition: PluginSectionKindDefinition) => void;
  registerPane: (definition: PluginPaneDefinition) => void;
  registerCommand: (definition: PluginCommandDefinition) => void;
  registerToolbarItem: (_definition: Record<string, unknown>) => void;
  registerContextMenu: (_definition: Record<string, unknown>) => void;
  registerSettingsPanel: (_definition: Record<string, unknown>) => void;
  getProjectContext: () => PluginProjectContext;
  subscribeProjectContext: (
    listener: (context: PluginProjectContext) => void,
  ) => () => void;
  readSection: (sectionId: string) => Record<string, unknown>;
  updateSection: (
    sectionId: string,
    patch: Partial<{
      data: Record<string, unknown>;
      kind: string;
      schemaVersion: number | null;
    }>,
  ) => void;
  openArtifact: (artifactId: string) => void;
  createArtifact: (
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
};

type PluginFrontendModule = {
  apiVersion?: unknown;
  register?: unknown;
};

type PluginRegistryAccumulator = {
  sectionKinds: Record<string, RegisteredPluginSectionKind>;
  panes: Record<string, RegisteredPluginPane[]>;
  commands: Record<string, RegisteredPluginCommand[]>;
};

type PluginRuntimeStatus = "idle" | "loading" | "loaded" | "error";

type PluginRuntimeStore = {
  status: PluginRuntimeStatus;
  statusMessage: string | null;
  schemaVersion: number | null;
  serverMode: PluginServerMode | null;
  restartCapability: PluginRestartCapability | null;
  pluginListById: Record<string, PluginListEntry>;
  pluginStatusById: Record<string, PluginStatusEntry>;
  statusEntries: PluginStatusEntry[];
  sectionKindsByKey: Record<string, RegisteredPluginSectionKind>;
  panesByPluginId: Record<string, RegisteredPluginPane[]>;
  commandsByPluginId: Record<string, RegisteredPluginCommand[]>;
  frontendErrorsByPluginId: Record<string, PluginFrontendError>;
  loadGeneration: number;
};

const EMPTY_RECORD: Record<string, unknown> = {};

const INITIAL_PLUGIN_RUNTIME_STORE: PluginRuntimeStore = {
  status: "idle",
  statusMessage: null,
  schemaVersion: null,
  serverMode: null,
  restartCapability: null,
  pluginListById: {},
  pluginStatusById: {},
  statusEntries: [],
  sectionKindsByKey: {},
  panesByPluginId: {},
  commandsByPluginId: {},
  frontendErrorsByPluginId: {},
  loadGeneration: 0,
};

const sectionKindCapability = "registerSectionKinds";
const paneCapability = "registerPane";
const commandCapability = "registerCommand";

const styleHrefByPluginId = new Map<string, string>();
const styleElementByPluginId = new Map<string, HTMLLinkElement>();
let pluginRuntimeLoadPromise: Promise<void> | null = null;

export const usePluginRuntimeStore = createWithEqualityFn<PluginRuntimeStore>(
  () => ({
    ...INITIAL_PLUGIN_RUNTIME_STORE,
  }),
);

export function usePluginRuntimeBootstrap(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refreshPluginRuntime();
  }, [enabled]);
}

export async function refreshPluginRuntime(): Promise<void> {
  if (pluginRuntimeLoadPromise) {
    return pluginRuntimeLoadPromise;
  }
  pluginRuntimeLoadPromise = loadPluginRuntime().finally(() => {
    pluginRuntimeLoadPromise = null;
  });
  return pluginRuntimeLoadPromise;
}

async function loadPluginRuntime(): Promise<void> {
  usePluginRuntimeStore.setState((state) => ({
    ...state,
    status: "loading",
    statusMessage: null,
  }));

  const [listResponse, statusResponse] = await Promise.all([
    route_plugins_list(),
    route_plugins_status(),
  ]);
  if (!res200(listResponse)) {
    const message = buildPluginRequestErrorMessage(
      "plugins list",
      listResponse,
    );
    usePluginRuntimeStore.setState((state) => ({
      ...state,
      status: "error",
      statusMessage: message,
    }));
    return;
  }
  if (!res200(statusResponse)) {
    const message = buildPluginRequestErrorMessage(
      "plugins status",
      statusResponse,
    );
    usePluginRuntimeStore.setState((state) => ({
      ...state,
      status: "error",
      statusMessage: message,
    }));
    return;
  }

  const listData = listResponse.data;
  const statusData = statusResponse.data;

  const pluginListById = mapPluginListById(listData);
  const pluginStatusById = mapPrimaryStatusByPluginId(statusData);
  const registryAccumulator: PluginRegistryAccumulator = {
    sectionKinds: {},
    panes: {},
    commands: {},
  };
  const frontendErrorsByPluginId: Record<string, PluginFrontendError> = {};

  await Promise.all(
    listData.plugins.map(async (plugin) => {
      const result = await loadPluginFrontendModule(
        plugin,
        listData.serverMode,
      );
      if (!result) {
        return;
      }
      if (result.error) {
        frontendErrorsByPluginId[plugin.pluginId] = result.error;
        return;
      }
      if (result.registryDelta) {
        for (const [key, value] of Object.entries(
          result.registryDelta.sectionKinds,
        )) {
          registryAccumulator.sectionKinds[key] = value;
        }
        for (const [pluginId, panes] of Object.entries(
          result.registryDelta.panes,
        )) {
          const existingPanes = registryAccumulator.panes[pluginId] ?? [];
          existingPanes.push(...panes);
          registryAccumulator.panes[pluginId] = existingPanes;
        }
        for (const [pluginId, commands] of Object.entries(
          result.registryDelta.commands,
        )) {
          const existingCommands = registryAccumulator.commands[pluginId] ?? [];
          existingCommands.push(...commands);
          registryAccumulator.commands[pluginId] = existingCommands;
        }
      }
    }),
  );

  removeInactivePluginStyles(new Set(Object.keys(pluginListById)));

  usePluginRuntimeStore.setState((state) => ({
    ...state,
    status: "loaded",
    statusMessage: null,
    schemaVersion: listData.schemaVersion,
    serverMode: listData.serverMode,
    restartCapability: listData.restartCapability,
    pluginListById,
    pluginStatusById,
    statusEntries: statusData.plugins,
    sectionKindsByKey: registryAccumulator.sectionKinds,
    panesByPluginId: registryAccumulator.panes,
    commandsByPluginId: registryAccumulator.commands,
    frontendErrorsByPluginId,
    loadGeneration: state.loadGeneration + 1,
  }));
}

type LoadPluginFrontendResult = {
  error: PluginFrontendError | null;
  registryDelta: PluginRegistryAccumulator | null;
};

async function loadPluginFrontendModule(
  plugin: PluginListEntry,
  serverMode: PluginServerMode,
): Promise<LoadPluginFrontendResult | null> {
  const entrypointUrl = resolvePluginAssetUrl(plugin.frontend.entrypointUrl);
  if (!entrypointUrl) {
    return {
      error: null,
      registryDelta: {
        sectionKinds: {},
        panes: {},
        commands: {},
      },
    };
  }

  try {
    ensurePluginStyleLoaded(
      plugin.pluginId,
      resolvePluginAssetUrl(plugin.frontend.styleUrl),
    );
    const importedModule = (await import(
      /* @vite-ignore */ entrypointUrl
    )) as PluginFrontendModule;
    const registryDelta = registerPluginModule({
      plugin,
      importedModule,
      serverMode,
    });
    return {
      error: null,
      registryDelta,
    };
  } catch (error) {
    return {
      error: toPluginFrontendLoadError(plugin.pluginId, error),
      registryDelta: null,
    };
  }
}

function registerPluginModule({
  plugin,
  importedModule,
  serverMode,
}: {
  plugin: PluginListEntry;
  importedModule: PluginFrontendModule;
  serverMode: PluginServerMode;
}): PluginRegistryAccumulator {
  const registerFn = importedModule.register;
  if (typeof registerFn !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${plugin.pluginId} frontend module must export register(host).`,
    );
  }

  const apiVersion = importedModule.apiVersion;
  if (
    typeof apiVersion !== "number" ||
    apiVersion !== PLUGIN_FRONTEND_API_VERSION
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.ApiVersionMismatch,
      `Plugin ${plugin.pluginId} apiVersion mismatch. Expected ${PLUGIN_FRONTEND_API_VERSION}.`,
    );
  }

  const registryDelta: PluginRegistryAccumulator = {
    sectionKinds: {},
    panes: {},
    commands: {},
  };

  const effectiveCapabilitySet = new Set(plugin.effectiveCapabilities);

  const host: SettaPluginHost = {
    apiVersion: PLUGIN_FRONTEND_API_VERSION,
    pluginId: plugin.pluginId,
    serverMode,
    effectiveCapabilities: plugin.effectiveCapabilities,
    registerSectionKind: (definition) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        sectionKindCapability,
        "registerSectionKind",
      );
      const validated = validateSectionKindDefinition(
        plugin.pluginId,
        definition,
      );
      const sectionKey = toPluginSectionKindKey(
        validated.pluginId,
        validated.kind,
      );
      if (registryDelta.sectionKinds[sectionKey]) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} registered duplicate section kind ` +
            `${validated.kind}.`,
        );
      }
      registryDelta.sectionKinds[sectionKey] = validated;
    },
    registerPane: (definition) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        paneCapability,
        "registerPane",
      );
      const validated = validatePaneDefinition(plugin.pluginId, definition);
      const pluginPanes = registryDelta.panes[plugin.pluginId] ?? [];
      for (const existingPane of pluginPanes) {
        if (existingPane.id === validated.id) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `Plugin ${plugin.pluginId} registered duplicate pane ` +
              `${validated.id}.`,
          );
        }
      }
      pluginPanes.push(validated);
      registryDelta.panes[plugin.pluginId] = pluginPanes;
    },
    registerCommand: (definition) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        commandCapability,
        "registerCommand",
      );
      const validated = validateCommandDefinition(plugin.pluginId, definition);
      const pluginCommands = registryDelta.commands[plugin.pluginId] ?? [];
      for (const existingCommand of pluginCommands) {
        if (existingCommand.id === validated.id) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `Plugin ${plugin.pluginId} registered duplicate command ` +
              `${validated.id}.`,
          );
        }
      }
      pluginCommands.push(validated);
      registryDelta.commands[plugin.pluginId] = pluginCommands;
    },
    registerToolbarItem: (_definition) => {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.CapabilityDenied,
        "registerToolbarItem is not implemented in this host yet.",
      );
    },
    registerContextMenu: (_definition) => {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.CapabilityDenied,
        "registerContextMenu is not implemented in this host yet.",
      );
    },
    registerSettingsPanel: (_definition) => {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.CapabilityDenied,
        "registerSettingsPanel is not implemented in this host yet.",
      );
    },
    getProjectContext: () => {
      const projectState = useProjectState.getState();
      return {
        projectConfigId: projectState.projectConfig.id,
        serverMode,
      };
    },
    subscribeProjectContext: (listener) => {
      const emit = () => listener(host.getProjectContext());
      const unsubscribe = useProjectState.subscribe(emit);
      return () => {
        unsubscribe();
      };
    },
    readSection: (sectionId) => {
      const state = useProjectState.getState();
      const impl = getCurrEffectiveSectionImpl(state, sectionId);
      return structuredClone(impl) as Record<string, unknown>;
    },
    updateSection: (sectionId, patch) => {
      useProjectState.setState((state) => {
        const impl = getCurrEffectiveSectionImpl(state, sectionId);
        if (impl.type !== SectionTypeEnum.Plugin) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `updateSection only supports Plugin sections in MVP. sectionId=${sectionId}`,
          );
        }
        if (patch.data !== undefined) {
          impl.data = structuredClone(patch.data);
        }
        if (patch.kind !== undefined) {
          impl.kind = patch.kind;
        }
        if (patch.schemaVersion !== undefined) {
          impl.schemaVersion = patch.schemaVersion;
        }
      });
    },
    openArtifact: (_artifactId) => {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.CapabilityDenied,
        "openArtifact is not implemented in this host yet.",
      );
    },
    createArtifact: async (_payload) => {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.CapabilityDenied,
        "createArtifact is not implemented in this host yet.",
      );
    },
    apiFetch: async (path, init) => {
      const normalizedPath = normalizePluginPath(path);
      const shareSession = useShareSession.getState();
      const shareHeaders: Record<string, string> = {};
      if (shareSession.isDeploymentMode && shareSession.shareSessionId) {
        shareHeaders["X-Share-Session-Id"] = shareSession.shareSessionId;
      }
      const requestHeaders = new Headers(init?.headers ?? undefined);
      for (const [key, value] of Object.entries(shareHeaders)) {
        requestHeaders.set(key, value);
      }
      return fetch(
        `${C_ADDRESSES.BACKEND}/plugins/${plugin.pluginId}${normalizedPath}`,
        {
          ...init,
          credentials: "include",
          headers: requestHeaders,
        },
      );
    },
  };

  const registerResult = (registerFn as (host: SettaPluginHost) => unknown)(
    host,
  );
  if (isPromiseLike(registerResult)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${plugin.pluginId} returned a Promise from register(host); ` +
        "async register is not supported in MVP.",
    );
  }

  for (const paneEntries of Object.values(registryDelta.panes)) {
    paneEntries.sort((a, b) => a.title.localeCompare(b.title));
  }
  for (const commandEntries of Object.values(registryDelta.commands)) {
    commandEntries.sort((a, b) => a.title.localeCompare(b.title));
  }

  return registryDelta;
}

function normalizePluginPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "") {
    return "";
  }
  if (trimmed.startsWith("/")) {
    return trimmed;
  }
  return `/${trimmed}`;
}

function ensureCapability(
  pluginId: string,
  effectiveCapabilitySet: Set<string>,
  requiredCapability: string,
  hostMethodName: string,
): void {
  if (effectiveCapabilitySet.has(requiredCapability)) {
    return;
  }
  throw new PluginRuntimeError(
    PluginFrontendErrorCodeEnum.CapabilityDenied,
    `Plugin ${pluginId} cannot call ${hostMethodName}; missing effective capability ${requiredCapability}.`,
  );
}

function validateSectionKindDefinition(
  pluginId: string,
  definition: PluginSectionKindDefinition,
): RegisteredPluginSectionKind {
  const kind = requireNonEmptyString(
    definition.kind,
    `Plugin ${pluginId} section kind definition missing kind.`,
  );
  const title = requireNonEmptyString(
    definition.title,
    `Plugin ${pluginId} section kind ${kind} missing title.`,
  );
  if (!definition.renderer || typeof definition.renderer !== "object") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} section kind ${kind} missing renderer object.`,
    );
  }
  if (typeof definition.renderer.mount !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} section kind ${kind} renderer.mount must be a function.`,
    );
  }
  if (
    definition.renderer.update !== undefined &&
    typeof definition.renderer.update !== "function"
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} section kind ${kind} renderer.update must be a function when provided.`,
    );
  }
  if (
    definition.renderer.unmount !== undefined &&
    typeof definition.renderer.unmount !== "function"
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} section kind ${kind} renderer.unmount must be a function when provided.`,
    );
  }
  if (
    definition.initialData !== undefined &&
    !isPlainRecord(definition.initialData)
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} section kind ${kind} initialData must be a plain object when provided.`,
    );
  }

  const sectionKind: RegisteredPluginSectionKind = {
    pluginId,
    kind,
    title,
    renderer: definition.renderer,
  };
  if (definition.description !== undefined) {
    sectionKind.description = definition.description;
  }
  if (definition.initialData !== undefined) {
    sectionKind.initialData = definition.initialData;
  }
  return sectionKind;
}

function validatePaneDefinition(
  pluginId: string,
  definition: PluginPaneDefinition,
): RegisteredPluginPane {
  const id = requireNonEmptyString(
    definition.id,
    `Plugin ${pluginId} pane definition missing id.`,
  );
  const title = requireNonEmptyString(
    definition.title,
    `Plugin ${pluginId} pane ${id} missing title.`,
  );
  if (!definition.renderer || typeof definition.renderer !== "object") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} pane ${id} missing renderer object.`,
    );
  }
  if (typeof definition.renderer.mount !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} pane ${id} renderer.mount must be a function.`,
    );
  }
  if (
    definition.renderer.update !== undefined &&
    typeof definition.renderer.update !== "function"
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} pane ${id} renderer.update must be a function when provided.`,
    );
  }
  if (
    definition.renderer.unmount !== undefined &&
    typeof definition.renderer.unmount !== "function"
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} pane ${id} renderer.unmount must be a function when provided.`,
    );
  }
  let icon: PluginPaneIconName | undefined;
  if (definition.icon !== undefined) {
    const iconValue = requireNonEmptyString(
      definition.icon,
      `Plugin ${pluginId} pane ${id} icon must be a supported icon name.`,
    );
    if (!isPluginPaneIconName(iconValue)) {
      const supportedIconNames = Object.values(PluginPaneIconNameEnum).join(
        ", ",
      );
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.RegistrationInvalid,
        `Plugin ${pluginId} pane ${id} icon ${iconValue} is invalid. ` +
          `Supported icons: ${supportedIconNames}.`,
      );
    }
    icon = iconValue;
  }

  const paneDefinition: RegisteredPluginPane = {
    pluginId,
    id,
    title,
    renderer: definition.renderer,
  };
  if (definition.description !== undefined) {
    paneDefinition.description = definition.description;
  }
  if (icon !== undefined) {
    paneDefinition.icon = icon;
  }
  return paneDefinition;
}

function validateCommandDefinition(
  pluginId: string,
  definition: PluginCommandDefinition,
): RegisteredPluginCommand {
  const id = requireNonEmptyString(
    definition.id,
    `Plugin ${pluginId} command definition missing id.`,
  );
  const title = requireNonEmptyString(
    definition.title,
    `Plugin ${pluginId} command ${id} missing title.`,
  );
  if (typeof definition.run !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} command ${id} run must be a function.`,
    );
  }

  const commandDefinition: RegisteredPluginCommand = {
    pluginId,
    id,
    title,
    run: definition.run,
  };
  if (definition.description !== undefined) {
    commandDefinition.description = definition.description;
  }
  return commandDefinition;
}

function requireNonEmptyString(value: unknown, errorMessage: string): string {
  if (typeof value !== "string") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      errorMessage,
    );
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      errorMessage,
    );
  }
  return trimmed;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  return typeof (value as PromiseLike<unknown>).then === "function";
}

class PluginRuntimeError extends Error {
  code: PluginFrontendErrorCode;

  constructor(code: PluginFrontendErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function toPluginFrontendLoadError(
  pluginId: string,
  error: unknown,
): PluginFrontendError {
  if (error instanceof PluginRuntimeError) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  const message =
    error instanceof Error
      ? error.message
      : `Unknown plugin frontend load error for ${pluginId}`;
  return {
    code: PluginFrontendErrorCodeEnum.FrontendLoadFailed,
    message,
  };
}

function ensurePluginStyleLoaded(
  pluginId: string,
  styleUrl: string | null,
): void {
  if (!styleUrl) {
    const existingStyle = styleElementByPluginId.get(pluginId);
    if (existingStyle) {
      existingStyle.remove();
      styleElementByPluginId.delete(pluginId);
      styleHrefByPluginId.delete(pluginId);
    }
    return;
  }

  const previousHref = styleHrefByPluginId.get(pluginId);
  if (previousHref === styleUrl && styleElementByPluginId.has(pluginId)) {
    return;
  }

  const existingStyle = styleElementByPluginId.get(pluginId);
  if (existingStyle) {
    existingStyle.remove();
    styleElementByPluginId.delete(pluginId);
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = styleUrl;
  link.dataset.settaPluginId = pluginId;
  link.dataset.settaPluginStyle = "true";
  document.head.append(link);

  styleElementByPluginId.set(pluginId, link);
  styleHrefByPluginId.set(pluginId, styleUrl);
}

function resolvePluginAssetUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return `${C_ADDRESSES.BACKEND_ORIGIN}${url}`;
  }
  return url;
}

function removeInactivePluginStyles(activePluginIds: Set<string>): void {
  for (const [pluginId, styleElement] of styleElementByPluginId.entries()) {
    if (activePluginIds.has(pluginId)) {
      continue;
    }
    styleElement.remove();
    styleElementByPluginId.delete(pluginId);
    styleHrefByPluginId.delete(pluginId);
  }
}

function mapPluginListById(
  response: PluginListResponse,
): Record<string, PluginListEntry> {
  const pluginListById: Record<string, PluginListEntry> = {};
  for (const plugin of response.plugins) {
    pluginListById[plugin.pluginId] = plugin;
  }
  return pluginListById;
}

function mapPrimaryStatusByPluginId(
  response: PluginStatusResponse,
): Record<string, PluginStatusEntry> {
  const pluginStatusById: Record<string, PluginStatusEntry> = {};
  for (const entry of response.plugins) {
    const existing = pluginStatusById[entry.pluginId];
    if (!existing) {
      pluginStatusById[entry.pluginId] = entry;
      continue;
    }
    if (existing.shadowedBySourcePath && !entry.shadowedBySourcePath) {
      pluginStatusById[entry.pluginId] = entry;
      continue;
    }
  }
  return pluginStatusById;
}

function buildPluginRequestErrorMessage(
  label: string,
  response: { status: number | undefined; hasResponse: boolean },
): string {
  if (!response.hasResponse) {
    return `Failed to fetch ${label}: network error.`;
  }
  return `Failed to fetch ${label}: status ${response.status}.`;
}

export function toPluginSectionKindKey(pluginId: string, kind: string): string {
  return `${pluginId}::${kind}`;
}

export function usePluginSectionKind(
  pluginId: string,
  kind: string,
): RegisteredPluginSectionKind | null {
  const sectionKey = toPluginSectionKindKey(pluginId, kind);
  return usePluginRuntimeStore(
    (state) => state.sectionKindsByKey[sectionKey] ?? null,
    _.isEqual,
  );
}

export function usePluginSectionKinds(): RegisteredPluginSectionKind[] {
  return usePluginRuntimeStore(
    (state) =>
      Object.values(state.sectionKindsByKey).sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
    _.isEqual,
  );
}

export function usePluginPaneTabs(): PluginPaneTabEntry[] {
  return usePluginRuntimeStore((state) => {
    const values: PluginPaneTabEntry[] = [];
    for (const [pluginId, paneEntries] of Object.entries(
      state.panesByPluginId,
    )) {
      for (const pane of paneEntries) {
        values.push({
          tabKey: buildPluginPaneOverviewTabName(pluginId, pane.id),
          pluginId,
          paneId: pane.id,
          title: pane.title,
          description: pane.description,
          icon: pane.icon,
        });
      }
    }
    values.sort((a, b) => {
      const byTitle = a.title.localeCompare(b.title);
      if (byTitle !== 0) {
        return byTitle;
      }
      const byPlugin = a.pluginId.localeCompare(b.pluginId);
      if (byPlugin !== 0) {
        return byPlugin;
      }
      return a.paneId.localeCompare(b.paneId);
    });
    return values;
  }, _.isEqual);
}

export function usePluginCommands(): RegisteredPluginCommand[] {
  return usePluginRuntimeStore((state) => {
    const values: RegisteredPluginCommand[] = [];
    for (const commandEntries of Object.values(state.commandsByPluginId)) {
      values.push(...commandEntries);
    }
    values.sort((a, b) => {
      const byTitle = a.title.localeCompare(b.title);
      if (byTitle !== 0) {
        return byTitle;
      }
      const byPlugin = a.pluginId.localeCompare(b.pluginId);
      if (byPlugin !== 0) {
        return byPlugin;
      }
      return a.id.localeCompare(b.id);
    });
    return values;
  }, _.isEqual);
}

export function usePluginListEntries(): PluginListEntry[] {
  return usePluginRuntimeStore(
    (state) =>
      Object.values(state.pluginListById).sort((a, b) =>
        a.pluginId.localeCompare(b.pluginId),
      ),
    _.isEqual,
  );
}

export function usePluginStatusEntries(): PluginStatusEntry[] {
  return usePluginRuntimeStore((state) => state.statusEntries, _.isEqual);
}

export function getPluginSectionFallbackReason(
  pluginId: string,
  _kind: string,
): PluginSectionFallbackReason {
  const state = usePluginRuntimeStore.getState();
  const statusEntry = state.pluginStatusById[pluginId];
  if (!statusEntry) {
    return PluginSectionFallbackReasonEnum.plugin_not_installed;
  }
  if (statusEntry.state === PluginRuntimeStateEnum.disabled) {
    return PluginSectionFallbackReasonEnum.plugin_disabled;
  }
  if (
    isCapabilityBlocked(
      statusEntry.blockedCapabilities,
      sectionKindCapability,
    ) ||
    !statusEntry.effectiveCapabilities.includes(sectionKindCapability)
  ) {
    return PluginSectionFallbackReasonEnum.mode_blocked;
  }

  if (state.frontendErrorsByPluginId[pluginId]) {
    return PluginSectionFallbackReasonEnum.frontend_load_failed;
  }

  return PluginSectionFallbackReasonEnum.frontend_load_failed;
}

function isCapabilityBlocked(
  blockedCapabilities: PluginBlockedCapability[],
  capability: string,
): boolean {
  for (const blockedCapability of blockedCapabilities) {
    if (blockedCapability.capability === capability) {
      return true;
    }
  }
  return false;
}

export function resetPluginRuntimeStoreForTests(): void {
  for (const link of styleElementByPluginId.values()) {
    link.remove();
  }
  styleElementByPluginId.clear();
  styleHrefByPluginId.clear();
  pluginRuntimeLoadPromise = null;
  usePluginRuntimeStore.setState({
    ...INITIAL_PLUGIN_RUNTIME_STORE,
    pluginListById: {},
    pluginStatusById: {},
    statusEntries: [],
    sectionKindsByKey: {},
    panesByPluginId: {},
    commandsByPluginId: {},
    frontendErrorsByPluginId: {},
    statusMessage: null,
    schemaVersion: null,
    serverMode: null,
    restartCapability: null,
    loadGeneration: 0,
  });
}

export function getPluginSectionKindsForCreateMenu(): Array<{
  pluginId: string;
  kind: string;
  title: string;
  initialData: Record<string, unknown>;
}> {
  const sectionKinds = usePluginRuntimeStore.getState().sectionKindsByKey;
  const values = Object.values(sectionKinds).map((sectionKind) => ({
    pluginId: sectionKind.pluginId,
    kind: sectionKind.kind,
    title: sectionKind.title,
    initialData: sectionKind.initialData ?? EMPTY_RECORD,
  }));
  return values.sort((a, b) => a.title.localeCompare(b.title));
}

export const pluginRuntimeTestApi = {
  loadPluginFrontendModule,
};
