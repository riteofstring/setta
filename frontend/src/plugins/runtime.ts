import throttle from "lodash/throttle";
import { useEffect } from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { sendRealtimeDependencyEvent } from "state/actions/websocketReceive";
import { useProjectState, useShareSession } from "state/definitions";
import { C_ADDRESSES } from "utils/c_addresses";
import { buildPluginPaneOverviewTabName } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_plugins_list,
  route_plugins_status,
} from "utils/generatedEndpoints";
import {
  BaseDependencyKeyUnion,
  BaseDependencyValueUnion,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  PluginBlockedCapability,
  PluginListEntry,
  PluginListResponse,
  PluginRestartCapability,
  PluginRuntimeStateEnum,
  PluginStatusEntry,
  PluginStatusResponse,
  SectionDependencyKey,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { createWithEqualityFn } from "zustand/traditional";
import { createStore, type StateCreator, type StoreApi } from "zustand/vanilla";
import {
  isPluginPaneIconName,
  PluginPaneIconNameEnum,
  type PluginPaneIconName,
} from "./paneIcons";

export { PluginPaneIconNameEnum, type PluginPaneIconName } from "./paneIcons";

export const PLUGIN_FRONTEND_API_VERSION = 1;

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
  section_kind_missing: "section_kind_missing",
  mode_blocked: "mode_blocked",
} as const;

type PluginSectionFallbackReason =
  (typeof PluginSectionFallbackReasonEnum)[keyof typeof PluginSectionFallbackReasonEnum];

export type PluginServerMode = "ide" | "share" | "app";

export type PluginSectionProps = {
  sectionId: string;
  pluginId: string;
  kind: string;
  data: Record<string, unknown>;
  readOnly: boolean;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
};

export type PluginSectionRenderer = {
  mount: (el: HTMLElement, props: PluginSectionProps) => void;
  update?: (el: HTMLElement, props: PluginSectionProps) => void;
  unmount?: (el: HTMLElement) => void;
};

export type PluginSectionKindDefinition = {
  kind: string;
  title: string;
  description?: string;
  initialData?: Record<string, unknown>;
  renderer: PluginSectionRenderer;
};

export type RegisteredPluginSectionKind = PluginSectionKindDefinition & {
  pluginId: string;
};

export type PluginPaneProps = {
  pluginId: string;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
};

type PluginPaneRenderer = {
  mount: (el: HTMLElement, props: PluginPaneProps) => void;
  update?: (el: HTMLElement, props: PluginPaneProps) => void;
  unmount?: (el: HTMLElement) => void;
};

export type PluginPaneDefinition = {
  id: string;
  title: string;
  description?: string;
  icon?: PluginPaneIconName;
  renderer: PluginPaneRenderer;
};

export type RegisteredPluginPane = PluginPaneDefinition & {
  pluginId: string;
};

export type PluginCommandDefinition = {
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
};

export type RegisteredPluginCommand = PluginCommandDefinition & {
  pluginId: string;
};

type PluginTopNavBarItemDefinition = {
  id: string;
  label: string;
  description?: string;
  order?: number;
  onClick: () => void | Promise<void>;
};

type RegisteredPluginTopNavBarItem = PluginTopNavBarItemDefinition & {
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

export type PluginProjectStateSelector =
  | { kind: "projectConfig" }
  | { kind: "activeSectionIds" }
  | { kind: "section"; sectionId: string }
  | { kind: "sections"; sectionIds: string[] }
  | { kind: "singletonSections" };

export type PluginProjectStateSubscriptionOptions = {
  fireImmediately?: boolean;
  throttleMs?: number;
};

export type PluginRealtimeDependencyEvent = {
  dependencyKey: BaseDependencyKeyUnion;
  payload?: BaseDependencyValueUnion | null;
  binaryPayload?: ArrayBuffer;
  timestampMs?: number;
};

export type PluginSectionRealtimeEmitOptions = {
  timestampMs?: number;
};

export type SettaPluginHost = {
  apiVersion: number;
  pluginId: string;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
  createStore: <TState extends object>(
    initializer: StateCreator<TState, [], []>,
  ) => StoreApi<TState>;
  registerSectionKind: (definition: PluginSectionKindDefinition) => void;
  registerPane: (definition: PluginPaneDefinition) => void;
  registerCommand: (definition: PluginCommandDefinition) => void;
  registerTopNavBarItem: (definition: PluginTopNavBarItemDefinition) => void;
  registerContextMenu: (_definition: Record<string, unknown>) => void;
  getProjectContext: () => PluginProjectContext;
  subscribeProjectContext: (
    listener: (context: PluginProjectContext) => void,
  ) => () => void;
  readProjectState: (selector: PluginProjectStateSelector) => unknown;
  subscribeProjectState: (
    selector: PluginProjectStateSelector,
    listener: (nextValue: unknown, prevValue: unknown | null) => void,
    options?: PluginProjectStateSubscriptionOptions,
  ) => () => void;
  emitRealtimeDependencyEvent: (event: PluginRealtimeDependencyEvent) => void;
  emitSectionRealtimeValue: (
    sectionId: string,
    value: unknown,
    options?: PluginSectionRealtimeEmitOptions,
  ) => void;
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
  topNavBarItems: Record<string, RegisteredPluginTopNavBarItem[]>;
};

type PluginRuntimeStatus = "idle" | "loading" | "loaded" | "error";

type PluginRuntimeStore = {
  status: PluginRuntimeStatus;
  statusMessage: string | null;
  schemaVersion: number | null;
  serverMode: PluginServerMode | null;
  restartCapability: PluginRestartCapability | null;
  pluginListById: Record<string, PluginListEntry>;
  sortedPluginListEntries: PluginListEntry[];
  pluginStatusById: Record<string, PluginStatusEntry>;
  statusEntries: PluginStatusEntry[];
  sectionKindsByKey: Record<string, RegisteredPluginSectionKind>;
  sortedSectionKinds: RegisteredPluginSectionKind[];
  panesByPluginId: Record<string, RegisteredPluginPane[]>;
  sortedPaneTabs: PluginPaneTabEntry[];
  commandsByPluginId: Record<string, RegisteredPluginCommand[]>;
  sortedCommands: RegisteredPluginCommand[];
  topNavBarItemsByPluginId: Record<string, RegisteredPluginTopNavBarItem[]>;
  sortedTopNavBarItems: RegisteredPluginTopNavBarItem[];
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
  sortedPluginListEntries: [],
  pluginStatusById: {},
  statusEntries: [],
  sectionKindsByKey: {},
  sortedSectionKinds: [],
  panesByPluginId: {},
  sortedPaneTabs: [],
  commandsByPluginId: {},
  sortedCommands: [],
  topNavBarItemsByPluginId: {},
  sortedTopNavBarItems: [],
  frontendErrorsByPluginId: {},
  loadGeneration: 0,
};

const sectionKindCapability = "registerSectionKinds";
const paneCapability = "registerPane";
const commandCapability = "registerCommand";
const topNavBarCapability = "registerTopNavBarItem";
const readProjectStateCapability = "readProjectState";
const subscribeProjectStateCapability = "subscribeProjectState";
const emitListenerEventsCapability = "emitListenerEvents";

const styleHrefByPluginId = new Map<string, string>();
const styleElementByPluginId = new Map<string, HTMLLinkElement>();
const cleanupByPluginId = new Map<string, Set<() => void>>();
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
  runAllPluginCleanup();
  usePluginRuntimeStore.setState((state) => ({
    ...state,
    status: "loading",
    statusMessage: null,
    schemaVersion: null,
    serverMode: null,
    restartCapability: null,
    pluginListById: {},
    sortedPluginListEntries: [],
    pluginStatusById: {},
    statusEntries: [],
    sectionKindsByKey: {},
    sortedSectionKinds: [],
    panesByPluginId: {},
    sortedPaneTabs: [],
    commandsByPluginId: {},
    sortedCommands: [],
    topNavBarItemsByPluginId: {},
    sortedTopNavBarItems: [],
    frontendErrorsByPluginId: {},
  }));

  const [listResponse, statusResponse] = await Promise.all([
    route_plugins_list(),
    route_plugins_status(),
  ]);
  if (!res200(listResponse)) {
    removeAllPluginStyles();
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
    removeAllPluginStyles();
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
    topNavBarItems: {},
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
        for (const [pluginId, topNavBarItems] of Object.entries(
          result.registryDelta.topNavBarItems,
        )) {
          const existingTopNavBarItems =
            registryAccumulator.topNavBarItems[pluginId] ?? [];
          existingTopNavBarItems.push(...topNavBarItems);
          registryAccumulator.topNavBarItems[pluginId] = existingTopNavBarItems;
        }
      }
    }),
  );

  removeInactivePluginStyles(new Set(Object.keys(pluginListById)));

  const sortedPluginListEntries = toSortedPluginListEntries(pluginListById);
  const sortedSectionKinds = toSortedSectionKinds(
    registryAccumulator.sectionKinds,
  );
  const sortedPaneTabs = toSortedPluginPaneTabs(registryAccumulator.panes);
  const sortedCommands = toSortedPluginCommands(registryAccumulator.commands);
  const sortedTopNavBarItems = toSortedPluginTopNavBarItems(
    registryAccumulator.topNavBarItems,
  );

  usePluginRuntimeStore.setState((state) => ({
    ...state,
    status: "loaded",
    statusMessage: null,
    schemaVersion: listData.schemaVersion,
    serverMode: listData.serverMode,
    restartCapability: listData.restartCapability,
    pluginListById,
    sortedPluginListEntries,
    pluginStatusById,
    statusEntries: statusData.plugins,
    sectionKindsByKey: registryAccumulator.sectionKinds,
    sortedSectionKinds,
    panesByPluginId: registryAccumulator.panes,
    sortedPaneTabs,
    commandsByPluginId: registryAccumulator.commands,
    sortedCommands,
    topNavBarItemsByPluginId: registryAccumulator.topNavBarItems,
    sortedTopNavBarItems,
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
        topNavBarItems: {},
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
    runPluginCleanup(plugin.pluginId);
    return {
      error: toPluginFrontendLoadError(plugin.pluginId, error),
      registryDelta: null,
    };
  }
}

function registerPluginCleanup(
  pluginId: string,
  cleanup: () => void,
): () => void {
  let cleanups = cleanupByPluginId.get(pluginId);
  if (!cleanups) {
    cleanups = new Set<() => void>();
    cleanupByPluginId.set(pluginId, cleanups);
  }
  cleanups.add(cleanup);
  return () => {
    const existing = cleanupByPluginId.get(pluginId);
    if (!existing) {
      return;
    }
    existing.delete(cleanup);
    if (existing.size === 0) {
      cleanupByPluginId.delete(pluginId);
    }
  };
}

function runPluginCleanup(pluginId: string): void {
  const cleanups = cleanupByPluginId.get(pluginId);
  if (!cleanups) {
    return;
  }
  cleanupByPluginId.delete(pluginId);
  for (const cleanup of cleanups) {
    cleanup();
  }
}

function runAllPluginCleanup(): void {
  if (cleanupByPluginId.size === 0) {
    return;
  }
  for (const pluginId of Array.from(cleanupByPluginId.keys())) {
    runPluginCleanup(pluginId);
  }
}

function normalizeProjectStateSelector(
  pluginId: string,
  selector: PluginProjectStateSelector,
): PluginProjectStateSelector {
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} provided an invalid project state selector.`,
    );
  }
  const rawKind = (selector as { kind?: unknown }).kind;
  if (typeof rawKind !== "string" || rawKind.trim() === "") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} project state selector is missing kind.`,
    );
  }
  const kind = rawKind.trim();
  if (kind === "projectConfig" || kind === "activeSectionIds") {
    return { kind };
  }
  if (kind === "singletonSections") {
    return { kind };
  }
  if (kind === "section") {
    const sectionId = requireNonEmptyString(
      (selector as { sectionId?: unknown }).sectionId,
      `Plugin ${pluginId} section selector missing sectionId.`,
    );
    return {
      kind,
      sectionId,
    };
  }
  if (kind === "sections") {
    const sectionIdsRaw = (selector as { sectionIds?: unknown }).sectionIds;
    if (!Array.isArray(sectionIdsRaw)) {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.RegistrationInvalid,
        `Plugin ${pluginId} sections selector must provide sectionIds array.`,
      );
    }
    const sectionIds: string[] = [];
    for (const rawSectionId of sectionIdsRaw) {
      sectionIds.push(
        requireNonEmptyString(
          rawSectionId,
          `Plugin ${pluginId} sections selector contains invalid sectionId.`,
        ),
      );
    }
    return {
      kind,
      sectionIds,
    };
  }
  throw new PluginRuntimeError(
    PluginFrontendErrorCodeEnum.RegistrationInvalid,
    `Plugin ${pluginId} project state selector kind ${kind} is unsupported.`,
  );
}

function getRawSelectedProjectState(
  state: ReturnType<typeof useProjectState.getState>,
  selector: PluginProjectStateSelector,
): unknown {
  if (selector.kind === "projectConfig") {
    return state.projectConfig;
  }
  if (selector.kind === "activeSectionIds") {
    return state.projectConfig.activeIds;
  }
  if (selector.kind === "singletonSections") {
    return state.singletonSections;
  }
  if (selector.kind === "section") {
    const sectionId = selector.sectionId;
    const variantId = state.projectConfig.sectionVariantMap[sectionId];
    if (!variantId) {
      return null;
    }
    const variant = state.sectionVariants[variantId];
    if (!variant) {
      return null;
    }
    const impl = state.sectionImpls[variant.impl];
    if (!impl) {
      return null;
    }
    return impl;
  }
  return selector.sectionIds.map((sectionId) => {
    const variantId = state.projectConfig.sectionVariantMap[sectionId];
    if (!variantId) {
      return null;
    }
    const variant = state.sectionVariants[variantId];
    if (!variant) {
      return null;
    }
    const impl = state.sectionImpls[variant.impl];
    if (!impl) {
      return null;
    }
    return impl;
  });
}

function projectStateSubscriptionEquality(
  selector: PluginProjectStateSelector,
): ((left: unknown, right: unknown) => boolean) | undefined {
  if (selector.kind !== "sections") {
    return undefined;
  }
  return (left, right) => {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return false;
      }
    }
    return true;
  };
}

function toProjectStateReadValue(
  selector: PluginProjectStateSelector,
  rawValue: unknown,
): unknown {
  if (selector.kind !== "sections") {
    return structuredClone(rawValue);
  }
  return toProjectStateSectionSnapshot(selector.sectionIds, rawValue);
}

function toProjectStateSubscriptionValue(
  selector: PluginProjectStateSelector,
  rawValue: unknown,
): unknown {
  if (selector.kind !== "sections") {
    if (rawValue === undefined) {
      return null;
    }
    return structuredClone(rawValue);
  }
  return toProjectStateSectionSnapshot(selector.sectionIds, rawValue);
}

function toProjectStateSectionSnapshot(
  sectionIds: string[],
  rawValue: unknown,
): Record<string, unknown> {
  if (!Array.isArray(rawValue)) {
    return {};
  }
  const snapshot: Record<string, unknown> = {};
  for (let index = 0; index < sectionIds.length; index += 1) {
    const sectionId = sectionIds[index];
    const value = rawValue[index] ?? null;
    snapshot[sectionId] = value === null ? null : structuredClone(value);
  }
  return snapshot;
}

function toLiteralRealtimePayload(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  const serialized = JSON.stringify(value);
  if (typeof serialized === "string") {
    return serialized;
  }
  return "null";
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
    topNavBarItems: {},
  };

  const effectiveCapabilitySet = new Set(plugin.effectiveCapabilities);

  const host: SettaPluginHost = {
    apiVersion: PLUGIN_FRONTEND_API_VERSION,
    pluginId: plugin.pluginId,
    serverMode,
    effectiveCapabilities: plugin.effectiveCapabilities,
    createStore: (initializer) => createStore(initializer),
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
    registerTopNavBarItem: (definition) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        topNavBarCapability,
        "registerTopNavBarItem",
      );
      const validated = validateTopNavBarItemDefinition(
        plugin.pluginId,
        definition,
      );
      const pluginTopNavBarItems =
        registryDelta.topNavBarItems[plugin.pluginId] ?? [];
      for (const existingItem of pluginTopNavBarItems) {
        if (existingItem.id === validated.id) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `Plugin ${plugin.pluginId} registered duplicate top nav item ` +
              `${validated.id}.`,
          );
        }
      }
      pluginTopNavBarItems.push(validated);
      registryDelta.topNavBarItems[plugin.pluginId] = pluginTopNavBarItems;
    },
    registerContextMenu: (_definition) => {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.CapabilityDenied,
        "registerContextMenu is not implemented in this host yet.",
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
      const unsubscribe = useProjectState.subscribe(
        (state) => state.projectConfig.id,
        (projectConfigId, previousProjectConfigId) => {
          if (projectConfigId === previousProjectConfigId) {
            return;
          }
          listener({
            projectConfigId,
            serverMode,
          });
        },
      );
      const unregisterCleanup = registerPluginCleanup(
        plugin.pluginId,
        unsubscribe,
      );
      return () => {
        unregisterCleanup();
        unsubscribe();
      };
    },
    readProjectState: (selector) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        readProjectStateCapability,
        "readProjectState",
      );
      const normalizedSelector = normalizeProjectStateSelector(
        plugin.pluginId,
        selector,
      );
      const rawValue = getRawSelectedProjectState(
        useProjectState.getState(),
        normalizedSelector,
      );
      return toProjectStateReadValue(normalizedSelector, rawValue);
    },
    subscribeProjectState: (selector, listener, options) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        subscribeProjectStateCapability,
        "subscribeProjectState",
      );
      const normalizedSelector = normalizeProjectStateSelector(
        plugin.pluginId,
        selector,
      );
      const fireImmediately = options?.fireImmediately ?? true;
      const throttleMs = options?.throttleMs ?? 0;
      if (!Number.isFinite(throttleMs) || throttleMs < 0) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} subscribeProjectState throttleMs must be ` +
            "a non-negative finite number.",
        );
      }

      let notify = (nextRawValue: unknown, prevRawValue: unknown): void => {
        const nextValue = toProjectStateSubscriptionValue(
          normalizedSelector,
          nextRawValue,
        );
        let prevValue: unknown | null = null;
        if (prevRawValue !== undefined) {
          prevValue = toProjectStateSubscriptionValue(
            normalizedSelector,
            prevRawValue,
          );
        }
        listener(nextValue, prevValue);
      };
      let cancelThrottle: (() => void) | null = null;
      if (throttleMs > 0) {
        const throttledNotify = throttle(notify, throttleMs, {
          leading: true,
          trailing: true,
        });
        notify = throttledNotify;
        cancelThrottle = () => throttledNotify.cancel();
      }
      const unsubscribe = useProjectState.subscribe(
        (state) => getRawSelectedProjectState(state, normalizedSelector),
        (nextRawValue, prevRawValue) => notify(nextRawValue, prevRawValue),
        {
          fireImmediately,
          equalityFn: projectStateSubscriptionEquality(normalizedSelector),
        },
      );
      const cleanup = () => {
        unsubscribe();
        if (cancelThrottle) {
          cancelThrottle();
        }
      };
      const unregisterCleanup = registerPluginCleanup(plugin.pluginId, cleanup);
      return () => {
        unregisterCleanup();
        cleanup();
      };
    },
    emitRealtimeDependencyEvent: (event) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        emitListenerEventsCapability,
        "emitRealtimeDependencyEvent",
      );
      if (!event || typeof event !== "object" || Array.isArray(event)) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} emitRealtimeDependencyEvent requires an object payload.`,
        );
      }
      const dependencyKey = (event as { dependencyKey?: unknown })
        .dependencyKey;
      if (!dependencyKey || typeof dependencyKey !== "object") {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} emitRealtimeDependencyEvent requires a ` +
            "dependencyKey object.",
        );
      }
      const payload = (event as { payload?: unknown }).payload;
      const binaryPayload = (event as { binaryPayload?: unknown })
        .binaryPayload;
      if (
        binaryPayload !== undefined &&
        !(binaryPayload instanceof ArrayBuffer)
      ) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} emitRealtimeDependencyEvent binaryPayload must be ` +
            "an ArrayBuffer.",
        );
      }
      if (
        payload &&
        typeof payload === "object" &&
        "type" in payload &&
        (payload as { type?: unknown }).type ===
          DependencyValueTypeEnum.Binary &&
        !(binaryPayload instanceof ArrayBuffer)
      ) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} emitRealtimeDependencyEvent requires ` +
            "binaryPayload for Binary payloads.",
        );
      }
      const timestampMs = (event as { timestampMs?: unknown }).timestampMs;
      if (
        timestampMs !== undefined &&
        (!Number.isFinite(timestampMs) || Number.isNaN(timestampMs))
      ) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} emitRealtimeDependencyEvent timestampMs must be ` +
            "a finite number.",
        );
      }
      sendRealtimeDependencyEvent({
        dependencyKey: dependencyKey as BaseDependencyKeyUnion,
        payload:
          (payload as BaseDependencyValueUnion | null | undefined) ?? null,
        binaryPayload: binaryPayload as ArrayBuffer | undefined,
        timestampMs: timestampMs as number | undefined,
      });
    },
    emitSectionRealtimeValue: (sectionId, value, options) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        emitListenerEventsCapability,
        "emitSectionRealtimeValue",
      );
      const normalizedSectionId = requireNonEmptyString(
        sectionId,
        `Plugin ${plugin.pluginId} emitSectionRealtimeValue requires sectionId.`,
      );
      const timestampMs = options?.timestampMs;
      if (
        timestampMs !== undefined &&
        (!Number.isFinite(timestampMs) || Number.isNaN(timestampMs))
      ) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} emitSectionRealtimeValue timestampMs must be ` +
            "a finite number.",
        );
      }
      const dependencyKey: SectionDependencyKey = {
        type: DependencyKeyTypeEnum.Section,
        sectionId: normalizedSectionId,
      };
      host.emitRealtimeDependencyEvent({
        dependencyKey,
        payload: {
          type: DependencyValueTypeEnum.Literal,
          payload: toLiteralRealtimePayload(value),
        },
        timestampMs,
      });
    },
    readSection: (sectionId) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        sectionKindCapability,
        "readSection",
      );
      const state = useProjectState.getState();
      const impl = getCurrEffectiveSectionImpl(state, sectionId);
      if (impl.type !== SectionTypeEnum.Plugin) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `readSection only supports Plugin sections in MVP. sectionId=${sectionId}`,
        );
      }
      if (impl.pluginId !== plugin.pluginId) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.CapabilityDenied,
          `Plugin ${plugin.pluginId} cannot read section ${sectionId} owned by ${impl.pluginId}.`,
        );
      }
      return structuredClone(impl) as Record<string, unknown>;
    },
    updateSection: (sectionId, patch) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        sectionKindCapability,
        "updateSection",
      );
      useProjectState.setState((state) => {
        const variantId = state.projectConfig.sectionVariantMap[sectionId];
        if (!variantId) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `updateSection could not resolve section variant. sectionId=${sectionId}`,
          );
        }
        const variant = state.sectionVariants[variantId];
        if (!variant) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `updateSection could not resolve section variant. sectionId=${sectionId}`,
          );
        }
        const impl = state.sectionImpls[variant.impl];
        if (!impl) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `updateSection could not resolve section implementation. sectionId=${sectionId}`,
          );
        }
        if (impl.type !== SectionTypeEnum.Plugin) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `updateSection only supports Plugin sections in MVP. sectionId=${sectionId}`,
          );
        }
        if (impl.pluginId !== plugin.pluginId) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.CapabilityDenied,
            `Plugin ${plugin.pluginId} cannot update section ${sectionId} owned by ${impl.pluginId}.`,
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
  for (const topNavBarItems of Object.values(registryDelta.topNavBarItems)) {
    topNavBarItems.sort((a, b) => {
      const orderDelta = (a.order ?? 0) - (b.order ?? 0);
      if (orderDelta !== 0) {
        return orderDelta;
      }
      const byLabel = a.label.localeCompare(b.label);
      if (byLabel !== 0) {
        return byLabel;
      }
      return a.id.localeCompare(b.id);
    });
  }

  return registryDelta;
}

function isTraversalSegment(segment: string): boolean {
  if (segment === "." || segment === "..") {
    return true;
  }
  try {
    const decodedSegment = decodeURIComponent(segment);
    return decodedSegment === "." || decodedSegment === "..";
  } catch {
    return false;
  }
}

export function normalizePluginPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "") {
    return "";
  }
  const normalizedInput = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const queryStart = normalizedInput.search(/[?#]/);
  const pathPart =
    queryStart >= 0 ? normalizedInput.slice(0, queryStart) : normalizedInput;
  const suffix = queryStart >= 0 ? normalizedInput.slice(queryStart) : "";
  const segments = pathPart.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => isTraversalSegment(segment))) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `apiFetch path cannot include relative traversal segments: ${path}`,
    );
  }
  const hasTrailingSlash = pathPart.endsWith("/") && pathPart !== "/";
  let canonicalPath = "/";
  if (segments.length > 0) {
    canonicalPath = `/${segments.join("/")}`;
    if (hasTrailingSlash) {
      canonicalPath = `${canonicalPath}/`;
    }
  }
  return `${canonicalPath}${suffix}`;
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

function validateTopNavBarItemDefinition(
  pluginId: string,
  definition: PluginTopNavBarItemDefinition,
): RegisteredPluginTopNavBarItem {
  const id = requireNonEmptyString(
    definition.id,
    `Plugin ${pluginId} top nav item definition missing id.`,
  );
  const label = requireNonEmptyString(
    definition.label,
    `Plugin ${pluginId} top nav item ${id} missing label.`,
  );
  if (typeof definition.onClick !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} top nav item ${id} onClick must be a function.`,
    );
  }
  if (
    definition.order !== undefined &&
    (!Number.isFinite(definition.order) || Number.isNaN(definition.order))
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} top nav item ${id} order must be a finite number.`,
    );
  }
  const topNavBarItem: RegisteredPluginTopNavBarItem = {
    pluginId,
    id,
    label,
    onClick: definition.onClick,
  };
  if (definition.description !== undefined) {
    topNavBarItem.description = definition.description;
  }
  if (definition.order !== undefined) {
    topNavBarItem.order = definition.order;
  }
  return topNavBarItem;
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

function removeAllPluginStyles(): void {
  removeInactivePluginStyles(new Set<string>());
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

function toSortedPluginListEntries(
  pluginListById: Record<string, PluginListEntry>,
): PluginListEntry[] {
  return Object.values(pluginListById).sort((a, b) =>
    a.pluginId.localeCompare(b.pluginId),
  );
}

function toSortedSectionKinds(
  sectionKindsByKey: Record<string, RegisteredPluginSectionKind>,
): RegisteredPluginSectionKind[] {
  return Object.values(sectionKindsByKey).sort((a, b) =>
    a.title.localeCompare(b.title),
  );
}

function toSortedPluginPaneTabs(
  panesByPluginId: Record<string, RegisteredPluginPane[]>,
): PluginPaneTabEntry[] {
  const values: PluginPaneTabEntry[] = [];
  for (const [pluginId, paneEntries] of Object.entries(panesByPluginId)) {
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
}

function toSortedPluginCommands(
  commandsByPluginId: Record<string, RegisteredPluginCommand[]>,
): RegisteredPluginCommand[] {
  const values: RegisteredPluginCommand[] = [];
  for (const commandEntries of Object.values(commandsByPluginId)) {
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
}

function toSortedPluginTopNavBarItems(
  topNavBarItemsByPluginId: Record<string, RegisteredPluginTopNavBarItem[]>,
): RegisteredPluginTopNavBarItem[] {
  const values: RegisteredPluginTopNavBarItem[] = [];
  for (const topNavBarItemEntries of Object.values(topNavBarItemsByPluginId)) {
    values.push(...topNavBarItemEntries);
  }
  values.sort((a, b) => {
    const orderDelta = (a.order ?? 0) - (b.order ?? 0);
    if (orderDelta !== 0) {
      return orderDelta;
    }
    const byLabel = a.label.localeCompare(b.label);
    if (byLabel !== 0) {
      return byLabel;
    }
    const byPlugin = a.pluginId.localeCompare(b.pluginId);
    if (byPlugin !== 0) {
      return byPlugin;
    }
    return a.id.localeCompare(b.id);
  });
  return values;
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
  );
}

export function usePluginSectionKinds(): RegisteredPluginSectionKind[] {
  return usePluginRuntimeStore((state) => state.sortedSectionKinds);
}

export function usePluginPaneTabs(): PluginPaneTabEntry[] {
  return usePluginRuntimeStore((state) => state.sortedPaneTabs);
}

export function usePluginCommands(): RegisteredPluginCommand[] {
  return usePluginRuntimeStore((state) => state.sortedCommands);
}

export function usePluginTopNavBarItems(): RegisteredPluginTopNavBarItem[] {
  return usePluginRuntimeStore((state) => state.sortedTopNavBarItems);
}

export function usePluginListEntries(): PluginListEntry[] {
  return usePluginRuntimeStore((state) => state.sortedPluginListEntries);
}

export function usePluginStatusEntries(): PluginStatusEntry[] {
  return usePluginRuntimeStore((state) => state.statusEntries);
}

export function getPluginSectionFallbackReason(
  pluginId: string,
  kind: string,
): PluginSectionFallbackReason {
  return computePluginSectionFallbackReason(
    usePluginRuntimeStore.getState(),
    pluginId,
    kind,
  );
}

export function usePluginSectionFallbackReason(
  pluginId: string,
  kind: string,
): PluginSectionFallbackReason {
  return usePluginRuntimeStore((state) =>
    computePluginSectionFallbackReason(state, pluginId, kind),
  );
}

export function computePluginSectionFallbackReason(
  state: PluginRuntimeStore,
  pluginId: string,
  kind: string,
): PluginSectionFallbackReason {
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

  const sectionKindKey = toPluginSectionKindKey(pluginId, kind);
  if (!state.sectionKindsByKey[sectionKindKey]) {
    return PluginSectionFallbackReasonEnum.section_kind_missing;
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
  runAllPluginCleanup();
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
    topNavBarItemsByPluginId: {},
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
  normalizePluginPath,
};
