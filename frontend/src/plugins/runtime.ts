import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import { getPluginsRuntime } from "openapi/http";
import { useEffect } from "react";
import { buildPluginPaneOverviewTabName } from "utils/constants";
import {
  LanguageServerSelectionStatus,
  PluginListEntry,
  PluginListResponse,
  PluginRestartCapability,
  PluginRuntimeResponse,
  PluginStatusEntry,
} from "utils/generatedTypes";
import { createWithEqualityFn } from "zustand/traditional";
import {
  beginAppSubsystemFrontendRegistrationLoad,
  resetAppSubsystemFrontendRuntimeState,
  syncAppSubsystemFrontendRegistration,
} from "./appSubsystem";
import { type PluginPaneIconName } from "./paneIcons";
import type {
  PluginFrontendError,
  PluginRegistryAccumulator,
  RegisteredPluginCommand,
  RegisteredPluginSectionKind,
  RegisteredPluginTopNavBarItem,
} from "./runtimeInternal";
import {
  clearPluginRuntimeSideEffects,
  deleteInactivePluginFrontendSignatures,
  getPluginFrontendSignature,
  getRegisteredPluginCleanupIds,
  indexSectionKindKeysByPluginId,
  loadPluginFrontendModule,
  removeInactivePluginStyles,
  runPluginCleanup,
  runWithConcurrencyLimit,
  setPluginFrontendSignature,
  shouldLoadPluginFrontendForFeatureSelection,
} from "./runtimeInternal";
import {
  comparePluginCanvasControls,
  computePluginSectionFallbackReason,
  toPluginSectionKindKey,
  type PluginSectionFallbackReason,
  type PluginServerMode,
  type RegisteredPluginCanvasControl,
  type RegisteredPluginPane,
} from "./runtimeShared";

export { type PluginPaneIconName } from "./paneIcons";
export { invokePluginSettingRevealHandler } from "./runtimeInternal";
export type {
  RegisteredPluginCommand,
  RegisteredPluginSectionKind,
} from "./runtimeInternal";
export { PluginCanvasControlPlacementEnum } from "./runtimeShared";
export type {
  PluginServerMode,
  RegisteredPluginCanvasControl,
} from "./runtimeShared";

export type PluginPaneTabEntry = {
  tabKey: string;
  pluginId: string;
  paneId: string;
  title: string;
  description?: string;
  icon?: PluginPaneIconName;
};

type SortedRuntimeViews = {
  sortedPluginListEntries: PluginListEntry[];
  sortedSectionKinds: RegisteredPluginSectionKind[];
  sortedPaneTabs: PluginPaneTabEntry[];
  sortedCommands: RegisteredPluginCommand[];
  sortedTopNavBarItems: RegisteredPluginTopNavBarItem[];
  sortedCanvasControls: RegisteredPluginCanvasControl[];
};

type PluginRuntimeStatus = "idle" | "loading" | "loaded" | "error";

type PluginRuntimeStore = {
  status: PluginRuntimeStatus;
  statusMessage: string | null;
  schemaVersion: number | null;
  serverMode: PluginServerMode | null;
  appSubsystemCapabilities:
    | NonNullable<PluginRuntimeResponse["featureCapabilities"]>["appSubsystem"]
    | null;
  watchCodeCapabilities:
    | NonNullable<PluginRuntimeResponse["featureCapabilities"]>["watchCode"]
    | null;
  restartCapability: PluginRestartCapability | null;
  pluginListById: Record<string, PluginListEntry>;
  sortedPluginListEntries: PluginListEntry[];
  pluginStatusById: Record<string, PluginStatusEntry>;
  statusEntries: PluginStatusEntry[];
  languageServerSelectionsByLanguage: Record<
    string,
    LanguageServerSelectionStatus
  >;
  languageServerSelections: LanguageServerSelectionStatus[];
  appSubsystemRegistrationsByPluginId: PluginRegistryAccumulator["appSubsystemRegistrationsByPluginId"];
  sectionKindsByKey: Record<string, RegisteredPluginSectionKind>;
  sortedSectionKinds: RegisteredPluginSectionKind[];
  panesByPluginId: Record<string, RegisteredPluginPane[]>;
  sortedPaneTabs: PluginPaneTabEntry[];
  commandsByPluginId: Record<string, RegisteredPluginCommand[]>;
  sortedCommands: RegisteredPluginCommand[];
  topNavBarItemsByPluginId: Record<string, RegisteredPluginTopNavBarItem[]>;
  sortedTopNavBarItems: RegisteredPluginTopNavBarItem[];
  canvasControlsByPluginId: Record<string, RegisteredPluginCanvasControl[]>;
  sortedCanvasControls: RegisteredPluginCanvasControl[];
  frontendErrorsByPluginId: Record<string, PluginFrontendError>;
};

const INITIAL_PLUGIN_RUNTIME_STORE: PluginRuntimeStore = {
  status: "idle",
  statusMessage: null,
  schemaVersion: null,
  serverMode: null,
  appSubsystemCapabilities: null,
  watchCodeCapabilities: null,
  restartCapability: null,
  pluginListById: {},
  sortedPluginListEntries: [],
  pluginStatusById: {},
  statusEntries: [],
  languageServerSelectionsByLanguage: {},
  languageServerSelections: [],
  appSubsystemRegistrationsByPluginId: {},
  sectionKindsByKey: {},
  sortedSectionKinds: [],
  panesByPluginId: {},
  sortedPaneTabs: [],
  commandsByPluginId: {},
  sortedCommands: [],
  topNavBarItemsByPluginId: {},
  sortedTopNavBarItems: [],
  canvasControlsByPluginId: {},
  sortedCanvasControls: [],
  frontendErrorsByPluginId: {},
};

const pluginListEntryComparisonKeys = [
  "pluginId",
  "name",
  "version",
  "sourceScope",
  "sourceScopeLabel",
  "sourceManager",
  "sourceManagerHint",
  "canonicalSourceKey",
  "sourceDigestSha256",
  "enablementSource",
  "restartRequired",
] as const satisfies readonly (keyof PluginListEntry)[];

const pluginFrontendComparisonKeys = [
  "entrypointUrl",
  "styleUrl",
] as const satisfies readonly (keyof PluginListEntry["frontend"])[];

const pluginContentComparisonKeys = [
  "hasBlueprints",
  "hasProjectTemplates",
  "hasPrompts",
] as const satisfies readonly (keyof PluginListEntry["content"])[];

const pluginStatusEntryComparisonKeys = [
  "pluginId",
  "name",
  "version",
  "state",
  "sourceScope",
  "sourceScopeLabel",
  "sourceManager",
  "sourceManagerHint",
  "sourcePath",
  "canonicalSourceKey",
  "sourceDigestSha256",
  "shadowedBySourcePath",
  "enablementSource",
  "appliedLanguageServerLanguages",
  "restartRequired",
] as const satisfies readonly (keyof PluginStatusEntry)[];

const languageServerSelectionStatusComparisonKeys = [
  "language",
  "selectionState",
  "severity",
  "status",
  "message",
  "selectedPluginId",
  "appliedPluginId",
  "restartRequired",
] as const satisfies readonly (keyof LanguageServerSelectionStatus)[];

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
let queuedPluginRuntimeResponse: PluginRuntimeResponse | null = null;
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
  pluginRuntimeRefreshQueued = true;
  if (pluginRuntimeLoadPromise) {
    return pluginRuntimeLoadPromise;
  }
  pluginRuntimeLoadPromise = runQueuedPluginRuntimeRefreshes().finally(() => {
    pluginRuntimeLoadPromise = null;
  });
  return pluginRuntimeLoadPromise;
}

export async function receivePluginRuntimeUpdate(
  runtimeResponse: PluginRuntimeResponse,
): Promise<void> {
  beginAppSubsystemFrontendRegistrationLoad(
    runtimeResponse.featureCapabilities?.appSubsystem ?? null,
    buildSelectedAppSubsystemFrontendRefreshSignature(
      runtimeResponse.featureCapabilities?.appSubsystem ?? null,
      runtimeResponse.list.plugins,
      runtimeResponse.status.plugins,
    ),
  );
  queuedPluginRuntimeResponse = runtimeResponse;
  if (pluginRuntimeLoadPromise) {
    return pluginRuntimeLoadPromise;
  }
  pluginRuntimeLoadPromise = runQueuedPluginRuntimeRefreshes().finally(() => {
    pluginRuntimeLoadPromise = null;
  });
  return pluginRuntimeLoadPromise;
}

async function runQueuedPluginRuntimeRefreshes(): Promise<void> {
  while (queuedPluginRuntimeResponse !== null || pluginRuntimeRefreshQueued) {
    if (queuedPluginRuntimeResponse !== null) {
      const runtimeResponse = queuedPluginRuntimeResponse;
      queuedPluginRuntimeResponse = null;
      await applyPluginRuntimeResponse(runtimeResponse);
      continue;
    }
    pluginRuntimeRefreshQueued = false;
    await loadPluginRuntime();
  }
}

async function loadPluginRuntime(): Promise<void> {
  usePluginRuntimeStore.setState((state) => ({
    ...state,
    status: "loading",
    statusMessage: null,
  }));

  const runtimeResponse = (await callOpenAPI(
    getPluginsRuntime(),
  )) as ResponseDataAndStatus<PluginRuntimeResponse>;
  if (!res200(runtimeResponse)) {
    setPluginRuntimeLoadError(
      buildPluginRequestErrorMessage("plugins runtime", runtimeResponse),
    );
    return;
  }

  await applyPluginRuntimeResponse(runtimeResponse.data);
}

async function applyPluginRuntimeResponse(
  runtimeResponse: PluginRuntimeResponse,
): Promise<void> {
  const previousState = usePluginRuntimeStore.getState();
  const appSubsystemCapabilities =
    runtimeResponse.featureCapabilities?.appSubsystem ?? null;
  const watchCodeCapabilities =
    runtimeResponse.featureCapabilities?.watchCode ?? null;
  const listData = runtimeResponse.list;
  const statusData = runtimeResponse.status;
  const pluginListById = mapPluginListById(
    listData,
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
  const languageServerSelections = mapLanguageServerSelectionStatuses(
    statusData.languageServerSelections ?? [],
    previousState.languageServerSelections,
  );
  const languageServerSelectionsByLanguage =
    mapLanguageServerSelectionStatusByLanguage(
      languageServerSelections,
      previousState.languageServerSelectionsByLanguage,
    );
  const registryAccumulator: PluginRegistryAccumulator = {
    appSubsystemRegistrationsByPluginId: {},
    sectionKinds: {},
    panes: {},
    commands: {},
    topNavBarItems: {},
    canvasControls: {},
  };
  const frontendErrorsByPluginId: Record<string, PluginFrontendError> = {};
  const sectionKindKeysByPluginId = indexSectionKindKeysByPluginId(
    previousState.sectionKindsByKey,
  );
  const frontendLoadCandidates = listData.plugins.filter((plugin) =>
    shouldLoadPluginFrontendForFeatureSelection({
      pluginId: plugin.pluginId,
      statusEntry: pluginStatusById[plugin.pluginId],
      watchCodeCapabilities,
    }),
  );
  const frontendLoadCandidateIds = new Set(
    frontendLoadCandidates.map((plugin) => plugin.pluginId),
  );

  for (const pluginId of getRegisteredPluginCleanupIds()) {
    if (frontendLoadCandidateIds.has(pluginId)) {
      continue;
    }
    runPluginCleanup(pluginId);
  }

  const selectedAppSubsystemFrontendRefreshSignature =
    buildSelectedAppSubsystemFrontendRefreshSignature(
      appSubsystemCapabilities,
      listData.plugins,
      statusData.plugins,
    );
  beginAppSubsystemFrontendRegistrationLoad(
    appSubsystemCapabilities,
    selectedAppSubsystemFrontendRefreshSignature,
  );

  await runWithConcurrencyLimit(
    frontendLoadCandidates,
    PLUGIN_FRONTEND_LOAD_CONCURRENCY,
    async (plugin) => {
      const pluginId = plugin.pluginId;
      const signature = buildPluginFrontendRefreshSignature(
        plugin,
        pluginStatusById[pluginId],
      );
      const previousSignature = getPluginFrontendSignature(pluginId);
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
      setPluginFrontendSignature(pluginId, signature);
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

  deleteInactivePluginFrontendSignatures(frontendLoadCandidateIds);
  removeInactivePluginStyles(frontendLoadCandidateIds);

  const sortedRuntimeViews = deriveSortedRuntimeViews({
    previousState,
    orderedPlugins: listData.plugins,
    pluginListById,
    registryAccumulator,
  });
  const appSubsystemRegistrationsByPluginId = hasSameRecordValueReferences(
    registryAccumulator.appSubsystemRegistrationsByPluginId,
    previousState.appSubsystemRegistrationsByPluginId,
  )
    ? previousState.appSubsystemRegistrationsByPluginId
    : registryAccumulator.appSubsystemRegistrationsByPluginId;

  usePluginRuntimeStore.setState((state) => ({
    ...state,
    status: "loaded",
    statusMessage: null,
    schemaVersion: listData.schemaVersion,
    serverMode: listData.serverMode,
    appSubsystemCapabilities,
    watchCodeCapabilities,
    restartCapability: listData.restartCapability,
    pluginListById,
    sortedPluginListEntries: sortedRuntimeViews.sortedPluginListEntries,
    pluginStatusById,
    statusEntries,
    languageServerSelectionsByLanguage,
    languageServerSelections,
    appSubsystemRegistrationsByPluginId,
    sectionKindsByKey: registryAccumulator.sectionKinds,
    sortedSectionKinds: sortedRuntimeViews.sortedSectionKinds,
    panesByPluginId: registryAccumulator.panes,
    sortedPaneTabs: sortedRuntimeViews.sortedPaneTabs,
    commandsByPluginId: registryAccumulator.commands,
    sortedCommands: sortedRuntimeViews.sortedCommands,
    topNavBarItemsByPluginId: registryAccumulator.topNavBarItems,
    sortedTopNavBarItems: sortedRuntimeViews.sortedTopNavBarItems,
    canvasControlsByPluginId: registryAccumulator.canvasControls,
    sortedCanvasControls: sortedRuntimeViews.sortedCanvasControls,
    frontendErrorsByPluginId,
  }));

  await syncAppSubsystemFrontendRegistration(
    appSubsystemCapabilities,
    appSubsystemRegistrationsByPluginId,
    selectedAppSubsystemFrontendRefreshSignature,
  );
}

function setPluginRuntimeLoadError(message: string): void {
  clearPluginRuntimeSideEffects();
  resetAppSubsystemFrontendRuntimeState();
  usePluginRuntimeStore.setState((state) =>
    buildClearedRuntimeState(state, {
      status: "error",
      statusMessage: message,
    }),
  );
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
    appSubsystemCapabilities: null,
    watchCodeCapabilities: null,
    restartCapability: null,
    pluginListById: {},
    sortedPluginListEntries: [],
    pluginStatusById: {},
    statusEntries: [],
    languageServerSelectionsByLanguage: {},
    languageServerSelections: [],
    appSubsystemRegistrationsByPluginId: {},
    sectionKindsByKey: {},
    sortedSectionKinds: [],
    panesByPluginId: {},
    sortedPaneTabs: [],
    commandsByPluginId: {},
    sortedCommands: [],
    topNavBarItemsByPluginId: {},
    sortedTopNavBarItems: [],
    canvasControlsByPluginId: {},
    sortedCanvasControls: [],
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

function buildSelectedAppSubsystemFrontendRefreshSignature(
  appSubsystemCapabilities:
    | NonNullable<PluginRuntimeResponse["featureCapabilities"]>["appSubsystem"]
    | null,
  plugins: PluginListEntry[],
  statuses: PluginStatusEntry[],
): string | null {
  if (!appSubsystemCapabilities?.pluginEnabled) {
    return null;
  }
  const pluginId = appSubsystemCapabilities.pluginId?.trim() ?? "";
  if (!pluginId) {
    return null;
  }
  const plugin = plugins.find((entry) => entry.pluginId === pluginId);
  if (!plugin) {
    return null;
  }
  const statusEntry = statuses.find((entry) => entry.pluginId === pluginId);
  return buildPluginFrontendRefreshSignature(plugin, statusEntry);
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
  for (const [pluginId, registration] of Object.entries(
    delta.appSubsystemRegistrationsByPluginId,
  )) {
    target.appSubsystemRegistrationsByPluginId[pluginId] = registration;
  }
  for (const [key, value] of Object.entries(delta.sectionKinds)) {
    target.sectionKinds[key] = value;
  }
  appendRegistryEntriesByPluginId(target.panes, delta.panes);
  appendRegistryEntriesByPluginId(target.commands, delta.commands);
  appendRegistryEntriesByPluginId(target.topNavBarItems, delta.topNavBarItems);
  appendRegistryEntriesByPluginId(target.canvasControls, delta.canvasControls);
}

function appendRegistryEntriesByPluginId<TEntry>(
  target: Record<string, TEntry[]>,
  delta: Record<string, TEntry[]>,
): void {
  for (const [pluginId, entries] of Object.entries(delta)) {
    const existingEntries = target[pluginId] ?? [];
    existingEntries.push(...entries);
    target[pluginId] = existingEntries;
  }
}

function mergePluginRegistryFromState(
  state: PluginRuntimeStore,
  pluginId: string,
  sectionKindKeysByPluginId: Record<string, string[]>,
  target: PluginRegistryAccumulator,
): void {
  const appSubsystemRegistration =
    state.appSubsystemRegistrationsByPluginId[pluginId];
  if (appSubsystemRegistration) {
    target.appSubsystemRegistrationsByPluginId[pluginId] =
      appSubsystemRegistration;
  }
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
  const canvasControls = state.canvasControlsByPluginId[pluginId];
  if (canvasControls) {
    target.canvasControls[pluginId] = canvasControls;
  }
}

function mapPluginListById(
  response: PluginListResponse,
  previousPluginListById: Record<string, PluginListEntry>,
): Record<string, PluginListEntry> {
  const pluginListById: Record<string, PluginListEntry> = {};
  for (const plugin of response.plugins) {
    const previousEntry = previousPluginListById[plugin.pluginId];
    const nextEffectiveCapabilities = stableCapabilitiesReference(
      plugin.effectiveCapabilities,
      previousEntry?.effectiveCapabilities,
    );
    if (
      previousEntry &&
      canReusePluginListEntry(plugin, previousEntry, nextEffectiveCapabilities)
    ) {
      pluginListById[plugin.pluginId] = previousEntry;
      continue;
    }
    const nextEntry = {
      ...plugin,
      effectiveCapabilities: nextEffectiveCapabilities,
    };
    pluginListById[plugin.pluginId] = nextEntry;
  }
  return pluginListById;
}

function hasSameFieldValues<TObject, TKey extends keyof TObject>(
  left: TObject,
  right: TObject,
  keys: readonly TKey[],
): boolean {
  for (const key of keys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function hasMatchingPluginListEntryMetadata(
  plugin: PluginListEntry,
  previousEntry: PluginListEntry,
): boolean {
  return hasSameFieldValues(
    plugin,
    previousEntry,
    pluginListEntryComparisonKeys,
  );
}

function hasMatchingPluginFrontend(
  plugin: PluginListEntry,
  previousEntry: PluginListEntry,
): boolean {
  return hasSameFieldValues(
    plugin.frontend,
    previousEntry.frontend,
    pluginFrontendComparisonKeys,
  );
}

function hasMatchingPluginContent(
  plugin: PluginListEntry,
  previousEntry: PluginListEntry,
): boolean {
  return hasSameFieldValues(
    plugin.content,
    previousEntry.content,
    pluginContentComparisonKeys,
  );
}

function hasMatchingPluginConfig(
  plugin: PluginListEntry,
  previousEntry: PluginListEntry,
): boolean {
  if (plugin.config.hasSchema !== previousEntry.config.hasSchema) {
    return false;
  }
  return (
    hasSameJsonValueWithDigest({
      nextValue: plugin.config.schemaJson,
      previousValue: previousEntry.config.schemaJson,
      nextDigest: getPluginConfigSchemaDigest(plugin),
      previousDigest: getPluginConfigSchemaDigest(previousEntry),
    }) &&
    hasSameJsonValueWithDigest({
      nextValue: plugin.config.currentConfig,
      previousValue: previousEntry.config.currentConfig,
      nextDigest: getPluginConfigCurrentConfigDigest(plugin),
      previousDigest: getPluginConfigCurrentConfigDigest(previousEntry),
    })
  );
}

function canReusePluginListEntry(
  plugin: PluginListEntry,
  previousEntry: PluginListEntry,
  effectiveCapabilities: string[],
): boolean {
  if (effectiveCapabilities !== previousEntry.effectiveCapabilities) {
    return false;
  }
  if (!hasMatchingPluginListEntryMetadata(plugin, previousEntry)) {
    return false;
  }
  if (!hasMatchingPluginFrontend(plugin, previousEntry)) {
    return false;
  }
  if (!hasMatchingPluginContent(plugin, previousEntry)) {
    return false;
  }
  return hasMatchingPluginConfig(plugin, previousEntry);
}

function getPluginConfigSchemaDigest(entry: PluginListEntry): string | null {
  const configWithDigest = entry.config as {
    schemaJsonDigestSha256?: string | null;
  };
  return normalizeDigest(configWithDigest.schemaJsonDigestSha256);
}

function getPluginConfigCurrentConfigDigest(
  entry: PluginListEntry,
): string | null {
  const configWithDigest = entry.config as {
    currentConfigDigestSha256?: string | null;
  };
  return normalizeDigest(configWithDigest.currentConfigDigestSha256);
}

function normalizeDigest(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function hasSameJsonValueWithDigest({
  nextValue,
  previousValue,
  nextDigest,
  previousDigest,
}: {
  nextValue: unknown;
  previousValue: unknown;
  nextDigest: string | null;
  previousDigest: string | null;
}): boolean {
  if (nextDigest !== null && previousDigest !== null) {
    return nextDigest === previousDigest;
  }
  return hasSameJsonValue(nextValue, previousValue);
}

function stableCapabilitiesReference(
  capabilities: string[],
  previousCapabilities: string[] | undefined,
): string[] {
  if (
    !previousCapabilities ||
    capabilities.length !== previousCapabilities.length
  ) {
    return capabilities;
  }
  for (let index = 0; index < capabilities.length; index += 1) {
    if (capabilities[index] !== previousCapabilities[index]) {
      return capabilities;
    }
  }
  return previousCapabilities;
}

function getComparableJsonValueKind(
  left: unknown,
  right: unknown,
): "array" | "object" | null {
  if (left === null || right === null) {
    return null;
  }
  if (typeof left !== "object" || typeof right !== "object") {
    return null;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) ? "array" : null;
  }
  return "object";
}

function hasSameJsonArray(left: unknown[], right: unknown[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (!hasSameJsonValue(left[index], right[index])) {
      return false;
    }
  }
  return true;
}

function hasSameJsonObject(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!(key in right) || !hasSameJsonValue(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

function hasSameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  const comparableKind = getComparableJsonValueKind(left, right);
  if (comparableKind === "array") {
    return hasSameJsonArray(left as unknown[], right as unknown[]);
  }
  if (comparableKind === "object") {
    return hasSameJsonObject(
      left as Record<string, unknown>,
      right as Record<string, unknown>,
    );
  }
  return false;
}

function mapStatusEntries(
  statusEntries: PluginStatusEntry[],
  previousStatusEntries: PluginStatusEntry[],
): PluginStatusEntry[] {
  if (statusEntries.length === 0) {
    return previousStatusEntries.length === 0 ? previousStatusEntries : [];
  }
  const previousEntriesByKey = new Map<string, PluginStatusEntry>();
  for (const entry of previousStatusEntries) {
    previousEntriesByKey.set(buildPluginStatusEntryStableKey(entry), entry);
  }
  const mappedEntries: PluginStatusEntry[] = [];
  let canReusePreviousArray =
    previousStatusEntries.length === statusEntries.length;
  for (let index = 0; index < statusEntries.length; index += 1) {
    const nextEntry = statusEntries[index];
    const previousEntry = previousEntriesByKey.get(
      buildPluginStatusEntryStableKey(nextEntry),
    );
    if (previousEntry && canReusePluginStatusEntry(nextEntry, previousEntry)) {
      mappedEntries.push(previousEntry);
      if (previousStatusEntries[index] !== previousEntry) {
        canReusePreviousArray = false;
      }
      continue;
    }
    mappedEntries.push(nextEntry);
    canReusePreviousArray = false;
  }
  return canReusePreviousArray ? previousStatusEntries : mappedEntries;
}

function mapLanguageServerSelectionStatuses(
  statuses: LanguageServerSelectionStatus[],
  previousStatuses: LanguageServerSelectionStatus[],
): LanguageServerSelectionStatus[] {
  if (statuses.length === 0) {
    return previousStatuses.length === 0 ? previousStatuses : [];
  }
  const previousStatusesByLanguage = new Map<
    string,
    LanguageServerSelectionStatus
  >();
  for (const status of previousStatuses) {
    previousStatusesByLanguage.set(status.language, status);
  }
  const mappedStatuses: LanguageServerSelectionStatus[] = [];
  let canReusePreviousArray = previousStatuses.length === statuses.length;
  for (let index = 0; index < statuses.length; index += 1) {
    const nextStatus = statuses[index];
    const previousStatus = previousStatusesByLanguage.get(nextStatus.language);
    if (
      previousStatus &&
      canReuseLanguageServerSelectionStatus(nextStatus, previousStatus)
    ) {
      mappedStatuses.push(previousStatus);
      if (previousStatuses[index] !== previousStatus) {
        canReusePreviousArray = false;
      }
      continue;
    }
    mappedStatuses.push(nextStatus);
    canReusePreviousArray = false;
  }
  return canReusePreviousArray ? previousStatuses : mappedStatuses;
}

function canReuseLanguageServerSelectionStatus(
  status: LanguageServerSelectionStatus,
  previousStatus: LanguageServerSelectionStatus,
): boolean {
  return (
    hasSameFieldValues(
      status,
      previousStatus,
      languageServerSelectionStatusComparisonKeys,
    ) &&
    hasSameJsonValue(
      status.availableProviders ?? [],
      previousStatus.availableProviders ?? [],
    )
  );
}

function buildPluginStatusEntryStableKey(entry: PluginStatusEntry): string {
  return `${entry.pluginId}\u0000${entry.sourceScope}\u0000${entry.sourcePath}`;
}

function hasMatchingPluginStatusEntryMetadata(
  statusEntry: PluginStatusEntry,
  previousStatusEntry: PluginStatusEntry,
): boolean {
  return hasSameFieldValues(
    statusEntry,
    previousStatusEntry,
    pluginStatusEntryComparisonKeys,
  );
}

function canReusePluginStatusEntry(
  statusEntry: PluginStatusEntry,
  previousStatusEntry: PluginStatusEntry,
): boolean {
  if (!hasMatchingPluginStatusEntryMetadata(statusEntry, previousStatusEntry)) {
    return false;
  }
  const statusEntryDigest = getPluginStatusRuntimePayloadDigest(statusEntry);
  const previousStatusEntryDigest =
    getPluginStatusRuntimePayloadDigest(previousStatusEntry);
  return statusEntryDigest === previousStatusEntryDigest;
}

function getPluginStatusRuntimePayloadDigest(
  statusEntry: PluginStatusEntry,
): string {
  const normalizedDigest = normalizeDigest(
    statusEntry.runtimePayloadDigestSha256,
  );
  return normalizedDigest ?? "";
}

function mapPrimaryStatusByPluginId(
  statusEntries: PluginStatusEntry[],
  previousPluginStatusById: Record<string, PluginStatusEntry>,
): Record<string, PluginStatusEntry> {
  const pluginStatusById: Record<string, PluginStatusEntry> = {};
  for (const entry of statusEntries) {
    if (!(entry.pluginId in pluginStatusById)) {
      pluginStatusById[entry.pluginId] = entry;
    }
  }
  return hasSameRecordValueReferences(
    pluginStatusById,
    previousPluginStatusById,
  )
    ? previousPluginStatusById
    : pluginStatusById;
}

function mapLanguageServerSelectionStatusByLanguage(
  statuses: LanguageServerSelectionStatus[],
  previousSelectionsByLanguage: Record<string, LanguageServerSelectionStatus>,
): Record<string, LanguageServerSelectionStatus> {
  const selectionsByLanguage: Record<string, LanguageServerSelectionStatus> =
    {};
  for (const status of statuses) {
    selectionsByLanguage[status.language] = status;
  }
  return hasSameRecordValueReferences(
    selectionsByLanguage,
    previousSelectionsByLanguage,
  )
    ? previousSelectionsByLanguage
    : selectionsByLanguage;
}

function deriveSortedRuntimeViews({
  previousState,
  orderedPlugins,
  pluginListById,
  registryAccumulator,
}: {
  previousState: PluginRuntimeStore;
  orderedPlugins: PluginListEntry[];
  pluginListById: Record<string, PluginListEntry>;
  registryAccumulator: PluginRegistryAccumulator;
}): SortedRuntimeViews {
  const nextSortedPluginListEntries = toOrderedPluginListEntries(
    orderedPlugins,
    pluginListById,
  );
  const sortedPluginListEntries = hasSameOrderedReferences(
    nextSortedPluginListEntries,
    previousState.sortedPluginListEntries,
  )
    ? previousState.sortedPluginListEntries
    : nextSortedPluginListEntries;
  const sectionKindsUnchanged = hasSameRecordValueReferences(
    registryAccumulator.sectionKinds,
    previousState.sectionKindsByKey,
  );
  const panesUnchanged = hasSameRecordValueReferences(
    registryAccumulator.panes,
    previousState.panesByPluginId,
  );
  const commandsUnchanged = hasSameRecordValueReferences(
    registryAccumulator.commands,
    previousState.commandsByPluginId,
  );
  const topNavBarItemsUnchanged = hasSameRecordValueReferences(
    registryAccumulator.topNavBarItems,
    previousState.topNavBarItemsByPluginId,
  );
  const canvasControlsUnchanged = hasSameRecordValueReferences(
    registryAccumulator.canvasControls,
    previousState.canvasControlsByPluginId,
  );
  return {
    sortedPluginListEntries,
    sortedSectionKinds: sectionKindsUnchanged
      ? previousState.sortedSectionKinds
      : toSortedSectionKinds(registryAccumulator.sectionKinds),
    sortedPaneTabs: panesUnchanged
      ? previousState.sortedPaneTabs
      : toSortedPluginPaneTabs(registryAccumulator.panes),
    sortedCommands: commandsUnchanged
      ? previousState.sortedCommands
      : toSortedPluginCommands(registryAccumulator.commands),
    sortedTopNavBarItems: topNavBarItemsUnchanged
      ? previousState.sortedTopNavBarItems
      : toSortedPluginTopNavBarItems(registryAccumulator.topNavBarItems),
    sortedCanvasControls: canvasControlsUnchanged
      ? previousState.sortedCanvasControls
      : toSortedPluginCanvasControls(registryAccumulator.canvasControls),
  };
}

function hasSameRecordValueReferences<TValue>(
  left: Record<string, TValue>,
  right: Record<string, TValue>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!(key in right)) {
      return false;
    }
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function hasSameOrderedReferences<T>(left: T[], right: T[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function toOrderedPluginListEntries(
  orderedPlugins: PluginListEntry[],
  pluginListById: Record<string, PluginListEntry>,
): PluginListEntry[] {
  const entries: PluginListEntry[] = [];
  for (const plugin of orderedPlugins) {
    const mapped = pluginListById[plugin.pluginId];
    if (mapped) {
      entries.push(mapped);
    }
  }
  return entries;
}

function toSortedSectionKinds(
  sectionKindsByKey: Record<string, RegisteredPluginSectionKind>,
): RegisteredPluginSectionKind[] {
  return Object.values(sectionKindsByKey).sort((a, b) => {
    const byTitle = a.title.localeCompare(b.title);
    if (byTitle !== 0) {
      return byTitle;
    }
    const byPluginId = a.pluginId.localeCompare(b.pluginId);
    if (byPluginId !== 0) {
      return byPluginId;
    }
    return a.kind.localeCompare(b.kind);
  });
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

function toSortedPluginCanvasControls(
  canvasControlsByPluginId: Record<string, RegisteredPluginCanvasControl[]>,
): RegisteredPluginCanvasControl[] {
  const values: RegisteredPluginCanvasControl[] = [];
  for (const canvasControlEntries of Object.values(canvasControlsByPluginId)) {
    values.push(...canvasControlEntries);
  }
  values.sort(comparePluginCanvasControls);
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

export function usePluginCanvasControls(): RegisteredPluginCanvasControl[] {
  return usePluginRuntimeStore((state) => state.sortedCanvasControls);
}

export function usePluginListEntries(): PluginListEntry[] {
  return usePluginRuntimeStore((state) => state.sortedPluginListEntries);
}

export function usePluginStatusEntries(): PluginStatusEntry[] {
  return usePluginRuntimeStore((state) => state.statusEntries);
}

export function usePluginSectionFallbackReason(
  pluginId: string,
  kind: string,
): PluginSectionFallbackReason | null {
  return usePluginRuntimeStore((state) =>
    computePluginSectionFallbackReason(state, pluginId, kind),
  );
}
