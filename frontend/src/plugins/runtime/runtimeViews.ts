import { buildPluginPaneOverviewTabName } from "utils/constants";

import {
  LanguageServerSelectionStatus,
  PluginListEntry,
  PluginStatusEntry,
} from "utils/generatedTypes";

import type {
  PluginRegistryAccumulator,
  RegisteredPluginCommand,
  RegisteredPluginSectionKind,
  RegisteredPluginTopNavBarItem,
} from "../runtimeInternal";

import {
  comparePluginCanvasControls,
  computePluginSectionFallbackReason,
  toPluginSectionKindKey,
  type PluginSectionFallbackReason,
  type RegisteredPluginCanvasControl,
  type RegisteredPluginPane,
} from "../runtimeShared";

import {
  PluginPaneTabEntry,
  PluginRuntimeStore,
  SortedRuntimeViews,
  hasSameFieldValues,
  hasSameJsonValue,
  languageServerSelectionStatusComparisonKeys,
  normalizeDigest,
  pluginStatusEntryComparisonKeys,
  usePluginRuntimeStore,
} from "./runtimeState";

export function mapStatusEntries(
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

export function mapLanguageServerSelectionStatuses(
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

export function mapPrimaryStatusByPluginId(
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

export function mapLanguageServerSelectionStatusByLanguage(
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

export function deriveSortedRuntimeViews({
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

export function hasSameRecordValueReferences<TValue>(
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

export function buildPluginRequestErrorMessage(
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
