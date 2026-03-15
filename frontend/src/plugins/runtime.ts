import { useEffect } from "react";
import { res200 } from "utils/endpointUtils";
import { route_plugins_runtime } from "utils/generatedEndpoints";
import {
  PluginBlockedCapability,
  PluginListEntry,
  PluginRestartCapability,
  PluginRuntimeStateEnum,
  PluginStatusEntry,
} from "utils/generatedTypes";
import { createWithEqualityFn } from "zustand/traditional";
import {
  deriveSortedRuntimeViews,
  mapPluginListById,
  mapPrimaryStatusByPluginId,
  mapStatusEntries,
  type PluginPaneTabEntry,
} from "./runtimeDerivedViews";
import {
  createEmptyPluginRegistryAccumulator,
  toPluginSectionKindKey,
  type PluginFrontendError,
  type PluginRegistryAccumulator,
  type PluginServerMode,
  type RegisteredPluginCommand,
  type RegisteredPluginPane,
  type RegisteredPluginSectionKind,
  type RegisteredPluginTopNavBarItem,
} from "./runtimeHostTypes";
import { normalizePluginPath } from "./runtimeHostValidation";
import {
  clearPluginHostSideEffects,
  loadPluginFrontendModule,
  registerPluginSettingRevealHandler,
  removeInactivePluginStyles,
  runPluginCleanup,
} from "./runtimePluginHost";
import {
  cloneProjectStateSnapshot,
  toProjectStateSectionSnapshot,
} from "./runtimeProjectStateBridge";

export { type PluginPaneIconName } from "./paneIcons";
export type { PluginPaneTabEntry } from "./runtimeDerivedViews";
export { toPluginSectionKindKey } from "./runtimeHostTypes";
export type {
  RegisteredPluginCommand,
  RegisteredPluginPane,
  RegisteredPluginSectionKind,
} from "./runtimeHostTypes";
export { invokePluginSettingRevealHandler } from "./runtimePluginHost";
export { PluginFrontendErrorCodeEnum } from "./runtimeValidation";

export const PluginSectionFallbackReasonEnum = {
  plugin_disabled: "plugin_disabled",
  plugin_not_installed: "plugin_not_installed",
  frontend_load_failed: "frontend_load_failed",
  section_kind_missing: "section_kind_missing",
  mode_blocked: "mode_blocked",
} as const;

type PluginSectionFallbackReason =
  (typeof PluginSectionFallbackReasonEnum)[keyof typeof PluginSectionFallbackReasonEnum];

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
};

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
};

const sectionKindCapability = "registerSectionKinds";
const frontendSignatureByPluginId = new Map<string, string>();
const effectiveCapabilityDigestByPluginListEntry = new WeakMap<
  PluginListEntry,
  string
>();
const effectiveCapabilityDigestByStatusEntry = new WeakMap<
  PluginStatusEntry,
  string
>();
let pluginRuntimeLoadPromise: Promise<void> | null = null;
let pluginRuntimeRefreshQueued = false;
const PLUGIN_FRONTEND_LOAD_CONCURRENCY = 4;

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
    pluginRuntimeRefreshQueued = true;
    return pluginRuntimeLoadPromise;
  }
  pluginRuntimeLoadPromise = runQueuedPluginRuntimeRefreshes().finally(() => {
    pluginRuntimeLoadPromise = null;
  });
  return pluginRuntimeLoadPromise;
}

async function runQueuedPluginRuntimeRefreshes(): Promise<void> {
  do {
    pluginRuntimeRefreshQueued = false;
    await loadPluginRuntime();
  } while (pluginRuntimeRefreshQueued);
}

async function loadPluginRuntime(): Promise<void> {
  const previousState = usePluginRuntimeStore.getState();
  usePluginRuntimeStore.setState((state) => ({
    ...state,
    status: "loading",
    statusMessage: null,
  }));

  const runtimeResponse = await route_plugins_runtime();
  if (!res200(runtimeResponse)) {
    setPluginRuntimeLoadError(
      buildPluginRequestErrorMessage("plugins runtime", runtimeResponse),
    );
    return;
  }

  const listData = runtimeResponse.data.list;
  const statusData = runtimeResponse.data.status;

  const pluginListById = mapPluginListById(
    listData.plugins,
    previousState.pluginListById,
  );
  const statusEntries = mapStatusEntries(
    statusData.plugins,
    previousState.statusEntries,
  );
  const pluginStatusById = mapPrimaryStatusByPluginId(
    statusEntries,
    previousState.pluginStatusById,
  );
  const registryAccumulator = createEmptyPluginRegistryAccumulator();
  const frontendErrorsByPluginId: Record<string, PluginFrontendError> = {};
  const sectionKindKeysByPluginId = indexSectionKindKeysByPluginId(
    previousState.sectionKindsByKey,
  );
  const frontendLoadCandidates = listData.plugins.filter((plugin) =>
    shouldLoadPluginFrontend(pluginStatusById[plugin.pluginId]),
  );
  const frontendLoadCandidateIds = new Set(
    frontendLoadCandidates.map((plugin) => plugin.pluginId),
  );

  for (const pluginId of Object.keys(previousState.pluginListById)) {
    if (frontendLoadCandidateIds.has(pluginId)) {
      continue;
    }
    runPluginCleanup(pluginId);
  }

  await runWithConcurrencyLimit(
    frontendLoadCandidates,
    PLUGIN_FRONTEND_LOAD_CONCURRENCY,
    async (plugin) => {
      const pluginId = plugin.pluginId;
      const signature = buildPluginFrontendRefreshSignature(
        plugin,
        pluginStatusById[pluginId],
      );
      const previousSignature = frontendSignatureByPluginId.get(pluginId);
      const previousFrontendError =
        previousState.frontendErrorsByPluginId[pluginId];
      if (previousSignature === signature && !previousFrontendError) {
        mergePluginRegistryFromState(
          previousState,
          pluginId,
          sectionKindKeysByPluginId,
          registryAccumulator,
        );
        return;
      }
      if (previousSignature !== undefined) {
        runPluginCleanup(pluginId);
      }
      const result = await loadPluginFrontendModule(
        plugin,
        listData.serverMode,
      );
      frontendSignatureByPluginId.set(pluginId, signature);
      if (!result) {
        return;
      }
      if (result.error) {
        frontendErrorsByPluginId[pluginId] = result.error;
        return;
      }
      if (result.registryDelta) {
        mergeRegistryDelta(registryAccumulator, result.registryDelta);
      }
    },
  );

  for (const pluginId of Array.from(frontendSignatureByPluginId.keys())) {
    if (frontendLoadCandidateIds.has(pluginId)) {
      continue;
    }
    frontendSignatureByPluginId.delete(pluginId);
  }

  removeInactivePluginStyles(frontendLoadCandidateIds);

  const sortedRuntimeViews = deriveSortedRuntimeViews({
    previousState,
    orderedPlugins: listData.plugins,
    pluginListById,
    registryAccumulator,
  });

  usePluginRuntimeStore.setState((state) => ({
    ...state,
    status: "loaded",
    statusMessage: null,
    schemaVersion: listData.schemaVersion,
    serverMode: listData.serverMode,
    restartCapability: listData.restartCapability,
    pluginListById,
    sortedPluginListEntries: sortedRuntimeViews.sortedPluginListEntries,
    pluginStatusById,
    statusEntries,
    sectionKindsByKey: registryAccumulator.sectionKinds,
    sortedSectionKinds: sortedRuntimeViews.sortedSectionKinds,
    panesByPluginId: registryAccumulator.panes,
    sortedPaneTabs: sortedRuntimeViews.sortedPaneTabs,
    commandsByPluginId: registryAccumulator.commands,
    sortedCommands: sortedRuntimeViews.sortedCommands,
    topNavBarItemsByPluginId: registryAccumulator.topNavBarItems,
    sortedTopNavBarItems: sortedRuntimeViews.sortedTopNavBarItems,
    frontendErrorsByPluginId,
  }));
}

function setPluginRuntimeLoadError(message: string): void {
  clearPluginRuntimeSideEffects();
  usePluginRuntimeStore.setState((state) =>
    buildClearedRuntimeState(state, {
      status: "error",
      statusMessage: message,
    }),
  );
}

function clearPluginRuntimeSideEffects(): void {
  clearPluginHostSideEffects();
  frontendSignatureByPluginId.clear();
}

function buildClearedRuntimeState(
  state: PluginRuntimeStore,
  options: {
    status: PluginRuntimeStatus;
    statusMessage: string | null;
  },
): PluginRuntimeStore {
  return {
    ...state,
    status: options.status,
    statusMessage: options.statusMessage,
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
  };
}

function buildPluginFrontendRefreshSignature(
  plugin: PluginListEntry,
  statusEntry: PluginStatusEntry | undefined,
): string {
  const sourceDigest = plugin.sourceDigestSha256 ?? "";
  const entrypointUrl = plugin.frontend.entrypointUrl ?? "";
  const styleUrl = plugin.frontend.styleUrl ?? "";
  const effectiveCapabilityDigest = getFrontendEffectiveCapabilityDigest(
    plugin,
    statusEntry,
  );
  return `${plugin.pluginId}\u0000${sourceDigest}\u0000${entrypointUrl}\u0000${styleUrl}\u0000${effectiveCapabilityDigest}`;
}

function getFrontendEffectiveCapabilityDigest(
  plugin: PluginListEntry,
  statusEntry: PluginStatusEntry | undefined,
): string {
  if (statusEntry) {
    const cachedDigest =
      effectiveCapabilityDigestByStatusEntry.get(statusEntry);
    if (cachedDigest !== undefined) {
      return cachedDigest;
    }
    const digest = buildEffectiveCapabilityDigest(
      statusEntry.effectiveCapabilities,
    );
    effectiveCapabilityDigestByStatusEntry.set(statusEntry, digest);
    return digest;
  }
  const cachedDigest = effectiveCapabilityDigestByPluginListEntry.get(plugin);
  if (cachedDigest !== undefined) {
    return cachedDigest;
  }
  const digest = buildEffectiveCapabilityDigest(plugin.effectiveCapabilities);
  effectiveCapabilityDigestByPluginListEntry.set(plugin, digest);
  return digest;
}

function buildEffectiveCapabilityDigest(
  effectiveCapabilities: string[],
): string {
  if (effectiveCapabilities.length === 0) {
    return "";
  }
  const sortedCapabilities = [...effectiveCapabilities].sort();
  return sortedCapabilities.join("\u001f");
}

function mergeRegistryDelta(
  target: PluginRegistryAccumulator,
  delta: PluginRegistryAccumulator,
): void {
  for (const [key, value] of Object.entries(delta.sectionKinds)) {
    target.sectionKinds[key] = value;
  }
  for (const [pluginId, panes] of Object.entries(delta.panes)) {
    const existingPanes = target.panes[pluginId] ?? [];
    existingPanes.push(...panes);
    target.panes[pluginId] = existingPanes;
  }
  for (const [pluginId, commands] of Object.entries(delta.commands)) {
    const existingCommands = target.commands[pluginId] ?? [];
    existingCommands.push(...commands);
    target.commands[pluginId] = existingCommands;
  }
  for (const [pluginId, topNavBarItems] of Object.entries(
    delta.topNavBarItems,
  )) {
    const existingTopNavBarItems = target.topNavBarItems[pluginId] ?? [];
    existingTopNavBarItems.push(...topNavBarItems);
    target.topNavBarItems[pluginId] = existingTopNavBarItems;
  }
}

function indexSectionKindKeysByPluginId(
  sectionKindsByKey: Record<string, RegisteredPluginSectionKind>,
): Record<string, string[]> {
  const sectionKindKeysByPluginId: Record<string, string[]> = {};
  for (const [sectionKindKey, sectionKind] of Object.entries(
    sectionKindsByKey,
  )) {
    const existingKeys = sectionKindKeysByPluginId[sectionKind.pluginId] ?? [];
    existingKeys.push(sectionKindKey);
    sectionKindKeysByPluginId[sectionKind.pluginId] = existingKeys;
  }
  return sectionKindKeysByPluginId;
}

function mergePluginRegistryFromState(
  state: PluginRuntimeStore,
  pluginId: string,
  sectionKindKeysByPluginId: Record<string, string[]>,
  target: PluginRegistryAccumulator,
): void {
  const sectionKindKeys = sectionKindKeysByPluginId[pluginId] ?? [];
  for (const sectionKindKey of sectionKindKeys) {
    const sectionKind = state.sectionKindsByKey[sectionKindKey];
    if (!sectionKind) {
      continue;
    }
    target.sectionKinds[sectionKindKey] = sectionKind;
  }
  const panes = state.panesByPluginId[pluginId];
  if (panes) {
    target.panes[pluginId] = panes;
  }
  const commands = state.commandsByPluginId[pluginId];
  if (commands) {
    target.commands[pluginId] = commands;
  }
  const topNavBarItems = state.topNavBarItemsByPluginId[pluginId];
  if (topNavBarItems) {
    target.topNavBarItems[pluginId] = topNavBarItems;
  }
}

function shouldLoadPluginFrontend(
  statusEntry: PluginStatusEntry | undefined,
): boolean {
  if (statusEntry === undefined) {
    return false;
  }
  return (
    statusEntry.state === PluginRuntimeStateEnum.active ||
    statusEntry.state === PluginRuntimeStateEnum.pending_restart
  );
}

async function runWithConcurrencyLimit<T>(
  items: T[],
  concurrencyLimit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const normalizedLimit = Math.max(1, Math.floor(concurrencyLimit));
  let nextIndex = 0;
  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex]);
    }
  }
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(normalizedLimit, items.length);
  for (let index = 0; index < workerCount; index += 1) {
    workers.push(runNext());
  }
  await Promise.all(workers);
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
): PluginSectionFallbackReason | null {
  return computePluginSectionFallbackReason(
    usePluginRuntimeStore.getState(),
    pluginId,
    kind,
  );
}

export function usePluginSectionFallbackReason(
  pluginId: string,
  kind: string,
): PluginSectionFallbackReason | null {
  return usePluginRuntimeStore((state) =>
    computePluginSectionFallbackReason(state, pluginId, kind),
  );
}

export function computePluginSectionFallbackReason(
  state: PluginRuntimeStore,
  pluginId: string,
  kind: string,
): PluginSectionFallbackReason | null {
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

  return null;
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
  clearPluginRuntimeSideEffects();
  pluginRuntimeLoadPromise = null;
  pluginRuntimeRefreshQueued = false;
  usePluginRuntimeStore.setState(
    buildClearedRuntimeState(
      {
        ...INITIAL_PLUGIN_RUNTIME_STORE,
      },
      {
        status: "idle",
        statusMessage: null,
      },
    ),
  );
}

export const pluginRuntimeTestApi = {
  cloneProjectStateSnapshot,
  indexSectionKindKeysByPluginId,
  loadPluginFrontendModule,
  registerPluginSettingRevealHandler,
  normalizePluginPath,
  runWithConcurrencyLimit,
  shouldLoadPluginFrontend,
  toProjectStateSectionSnapshot,
};
