import { buildPluginPaneOverviewTabName } from "utils/constants";
import { PluginListEntry, PluginStatusEntry } from "utils/generatedTypes";
import { type PluginPaneIconName } from "./paneIcons";

export type PluginPaneTabEntry = {
  tabKey: string;
  pluginId: string;
  paneId: string;
  title: string;
  description?: string;
  icon?: PluginPaneIconName;
};

type RuntimeSectionKindLike = {
  pluginId: string;
  kind: string;
  title: string;
};

type RuntimePaneLike = {
  pluginId: string;
  id: string;
  title: string;
  description?: string;
  icon?: PluginPaneIconName;
};

type RuntimeCommandLike = {
  pluginId: string;
  id: string;
  title: string;
};

type RuntimeTopNavBarItemLike = {
  pluginId: string;
  id: string;
  label: string;
  order?: number;
};

type RuntimeRegistryAccumulator<
  TSectionKind extends RuntimeSectionKindLike,
  TPane extends RuntimePaneLike,
  TCommand extends RuntimeCommandLike,
  TTopNavBarItem extends RuntimeTopNavBarItemLike,
> = {
  sectionKinds: Record<string, TSectionKind>;
  panes: Record<string, TPane[]>;
  commands: Record<string, TCommand[]>;
  topNavBarItems: Record<string, TTopNavBarItem[]>;
};

type RuntimeDerivedStateSnapshot<
  TSectionKind extends RuntimeSectionKindLike,
  TPane extends RuntimePaneLike,
  TCommand extends RuntimeCommandLike,
  TTopNavBarItem extends RuntimeTopNavBarItemLike,
> = {
  sortedPluginListEntries: PluginListEntry[];
  sectionKindsByKey: Record<string, TSectionKind>;
  sortedSectionKinds: TSectionKind[];
  panesByPluginId: Record<string, TPane[]>;
  sortedPaneTabs: PluginPaneTabEntry[];
  commandsByPluginId: Record<string, TCommand[]>;
  sortedCommands: TCommand[];
  topNavBarItemsByPluginId: Record<string, TTopNavBarItem[]>;
  sortedTopNavBarItems: TTopNavBarItem[];
};

type RuntimeDerivedViews<
  TSectionKind extends RuntimeSectionKindLike,
  TCommand extends RuntimeCommandLike,
  TTopNavBarItem extends RuntimeTopNavBarItemLike,
> = {
  sortedPluginListEntries: PluginListEntry[];
  sortedSectionKinds: TSectionKind[];
  sortedPaneTabs: PluginPaneTabEntry[];
  sortedCommands: TCommand[];
  sortedTopNavBarItems: TTopNavBarItem[];
};

export function mapPluginListById(
  plugins: PluginListEntry[],
  previousPluginListById: Record<string, PluginListEntry>,
): Record<string, PluginListEntry> {
  const pluginListById: Record<string, PluginListEntry> = {};
  for (const plugin of plugins) {
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
    pluginListById[plugin.pluginId] = {
      ...plugin,
      effectiveCapabilities: nextEffectiveCapabilities,
    };
  }
  return pluginListById;
}

function canReusePluginListEntry(
  plugin: PluginListEntry,
  previousEntry: PluginListEntry,
  effectiveCapabilities: string[],
): boolean {
  if (effectiveCapabilities !== previousEntry.effectiveCapabilities) {
    return false;
  }
  if (
    plugin.pluginId !== previousEntry.pluginId ||
    plugin.name !== previousEntry.name ||
    plugin.version !== previousEntry.version ||
    plugin.sourceScope !== previousEntry.sourceScope ||
    plugin.sourceScopeLabel !== previousEntry.sourceScopeLabel ||
    plugin.sourceManager !== previousEntry.sourceManager ||
    plugin.sourceManagerHint !== previousEntry.sourceManagerHint ||
    plugin.canonicalSourceKey !== previousEntry.canonicalSourceKey ||
    plugin.sourceDigestSha256 !== previousEntry.sourceDigestSha256 ||
    plugin.enablementSource !== previousEntry.enablementSource ||
    plugin.restartRequired !== previousEntry.restartRequired
  ) {
    return false;
  }
  if (
    plugin.frontend.entrypointUrl !== previousEntry.frontend.entrypointUrl ||
    plugin.frontend.styleUrl !== previousEntry.frontend.styleUrl
  ) {
    return false;
  }
  if (
    plugin.content.hasBlueprints !== previousEntry.content.hasBlueprints ||
    plugin.content.hasProjectTemplates !==
      previousEntry.content.hasProjectTemplates ||
    plugin.content.hasPrompts !== previousEntry.content.hasPrompts
  ) {
    return false;
  }
  if (plugin.config.hasSchema !== previousEntry.config.hasSchema) {
    return false;
  }
  if (
    !hasSameJsonValueWithDigest({
      nextValue: plugin.config.schemaJson,
      previousValue: previousEntry.config.schemaJson,
      nextDigest: getPluginConfigSchemaDigest(plugin),
      previousDigest: getPluginConfigSchemaDigest(previousEntry),
    }) ||
    !hasSameJsonValueWithDigest({
      nextValue: plugin.config.currentConfig,
      previousValue: previousEntry.config.currentConfig,
      nextDigest: getPluginConfigCurrentConfigDigest(plugin),
      previousDigest: getPluginConfigCurrentConfigDigest(previousEntry),
    })
  ) {
    return false;
  }
  return true;
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

function hasSameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  const leftType = typeof left;
  const rightType = typeof right;
  if (leftType !== rightType) {
    return false;
  }
  if (leftType !== "object") {
    return false;
  }
  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!hasSameJsonValue(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }
  if (Array.isArray(right)) {
    return false;
  }
  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject);
  const rightKeys = Object.keys(rightObject);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!(key in rightObject)) {
      return false;
    }
    if (!hasSameJsonValue(leftObject[key], rightObject[key])) {
      return false;
    }
  }
  return true;
}

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

function buildPluginStatusEntryStableKey(entry: PluginStatusEntry): string {
  return `${entry.pluginId}\u0000${entry.sourceScope}\u0000${entry.sourcePath}`;
}

function canReusePluginStatusEntry(
  statusEntry: PluginStatusEntry,
  previousStatusEntry: PluginStatusEntry,
): boolean {
  if (
    statusEntry.pluginId !== previousStatusEntry.pluginId ||
    statusEntry.name !== previousStatusEntry.name ||
    statusEntry.version !== previousStatusEntry.version ||
    statusEntry.state !== previousStatusEntry.state ||
    statusEntry.sourceScope !== previousStatusEntry.sourceScope ||
    statusEntry.sourceScopeLabel !== previousStatusEntry.sourceScopeLabel ||
    statusEntry.sourceManager !== previousStatusEntry.sourceManager ||
    statusEntry.sourceManagerHint !== previousStatusEntry.sourceManagerHint ||
    statusEntry.sourcePath !== previousStatusEntry.sourcePath ||
    statusEntry.canonicalSourceKey !== previousStatusEntry.canonicalSourceKey ||
    statusEntry.sourceDigestSha256 !== previousStatusEntry.sourceDigestSha256 ||
    statusEntry.shadowedBySourcePath !==
      previousStatusEntry.shadowedBySourcePath ||
    statusEntry.enablementSource !== previousStatusEntry.enablementSource ||
    statusEntry.restartRequired !== previousStatusEntry.restartRequired
  ) {
    return false;
  }
  return (
    getPluginStatusRuntimePayloadDigest(statusEntry) ===
    getPluginStatusRuntimePayloadDigest(previousStatusEntry)
  );
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
    const existing = pluginStatusById[entry.pluginId];
    if (!existing) {
      pluginStatusById[entry.pluginId] = entry;
      continue;
    }
    if (existing.shadowedBySourcePath && !entry.shadowedBySourcePath) {
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

export function deriveSortedRuntimeViews<
  TSectionKind extends RuntimeSectionKindLike,
  TPane extends RuntimePaneLike,
  TCommand extends RuntimeCommandLike,
  TTopNavBarItem extends RuntimeTopNavBarItemLike,
>({
  previousState,
  orderedPlugins,
  pluginListById,
  registryAccumulator,
}: {
  previousState: RuntimeDerivedStateSnapshot<
    TSectionKind,
    TPane,
    TCommand,
    TTopNavBarItem
  >;
  orderedPlugins: PluginListEntry[];
  pluginListById: Record<string, PluginListEntry>;
  registryAccumulator: RuntimeRegistryAccumulator<
    TSectionKind,
    TPane,
    TCommand,
    TTopNavBarItem
  >;
}): RuntimeDerivedViews<TSectionKind, TCommand, TTopNavBarItem> {
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

function toSortedSectionKinds<TSectionKind extends RuntimeSectionKindLike>(
  sectionKindsByKey: Record<string, TSectionKind>,
): TSectionKind[] {
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

function toSortedPluginPaneTabs<TPane extends RuntimePaneLike>(
  panesByPluginId: Record<string, TPane[]>,
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

function toSortedPluginCommands<TCommand extends RuntimeCommandLike>(
  commandsByPluginId: Record<string, TCommand[]>,
): TCommand[] {
  const values: TCommand[] = [];
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

function toSortedPluginTopNavBarItems<
  TTopNavBarItem extends RuntimeTopNavBarItemLike,
>(
  topNavBarItemsByPluginId: Record<string, TTopNavBarItem[]>,
): TTopNavBarItem[] {
  const values: TTopNavBarItem[] = [];
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
