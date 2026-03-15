import type {
  PluginBlockedCapability,
  PluginInstallResponse,
  PluginListEntry,
  PluginStatusEntry,
} from "utils/generatedTypes";

type PluginRegisteredExternalAgentAdapter =
  PluginStatusEntry["registeredExternalAgentAdapters"][number];

const cachedExternalAgentAdaptersByStatus = new WeakMap<
  PluginStatusEntry,
  PluginRegisteredExternalAgentAdapter[]
>();

type PluginCapabilityStatus =
  | "effective"
  | "blocked"
  | "requested_unavailable"
  | "not_requested";

type PluginCapabilityStatusIndex = {
  capabilityStatusByCapability: Map<string, PluginCapabilityStatus>;
  blockedReasonByCapability: Map<string, string>;
};

export function buildCapabilityStatusIndex({
  requestedCapabilities,
  effectiveCapabilities,
  blockedCapabilities,
  capabilityList,
}: {
  requestedCapabilities: readonly string[];
  effectiveCapabilities: readonly string[];
  blockedCapabilities: readonly PluginBlockedCapability[];
  capabilityList: readonly string[];
}): PluginCapabilityStatusIndex {
  const requestedCapabilitySet = new Set(requestedCapabilities);
  const effectiveCapabilitySet = new Set(effectiveCapabilities);
  const blockedReasonByCapability = new Map<string, string>();
  for (const blockedCapability of blockedCapabilities) {
    blockedReasonByCapability.set(
      blockedCapability.capability,
      blockedCapability.reason,
    );
  }
  const capabilityStatusByCapability = new Map<
    string,
    PluginCapabilityStatus
  >();
  for (const capability of capabilityList) {
    if (!requestedCapabilitySet.has(capability)) {
      capabilityStatusByCapability.set(capability, "not_requested");
      continue;
    }
    if (effectiveCapabilitySet.has(capability)) {
      capabilityStatusByCapability.set(capability, "effective");
      continue;
    }
    if (blockedReasonByCapability.has(capability)) {
      capabilityStatusByCapability.set(capability, "blocked");
      continue;
    }
    capabilityStatusByCapability.set(capability, "requested_unavailable");
  }
  return {
    capabilityStatusByCapability,
    blockedReasonByCapability,
  };
}

export function getRegisteredExternalAgentAdapters(
  pluginStatus: PluginStatusEntry | null,
): PluginRegisteredExternalAgentAdapter[] {
  return getCachedSortedRegistrations(
    pluginStatus,
    cachedExternalAgentAdaptersByStatus,
    (entry) => entry.registeredExternalAgentAdapters,
    (a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) {
        return byName;
      }
      return a.adapterId.localeCompare(b.adapterId);
    },
  );
}

function getCachedSortedRegistrations<TRegistration>(
  pluginStatus: PluginStatusEntry | null,
  cache: WeakMap<PluginStatusEntry, TRegistration[]>,
  getRawRegistrations: (pluginStatus: PluginStatusEntry) => unknown,
  compare: (a: TRegistration, b: TRegistration) => number,
): TRegistration[] {
  if (pluginStatus === null) {
    return [];
  }
  const cached = cache.get(pluginStatus);
  if (cached) {
    return cached;
  }
  const rawRegistrations = getRawRegistrations(pluginStatus);
  const registrations = Array.isArray(rawRegistrations)
    ? ([...rawRegistrations] as TRegistration[])
    : [];
  registrations.sort(compare);
  cache.set(pluginStatus, registrations);
  return registrations;
}

function parseJsonObjectDraft(
  rawValue: string,
  invalidTypeMessage: string,
  invalidJsonMessage: string,
): {
  value: Record<string, unknown>;
  error: string | null;
} {
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return { value: {}, error: null };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isPlainObject(parsed)) {
      return {
        value: {},
        error: invalidTypeMessage,
      };
    }
    return { value: parsed, error: null };
  } catch {
    return {
      value: {},
      error: invalidJsonMessage,
    };
  }
}

function formatJsonObjectDraft(value: unknown): string {
  if (!isPlainObject(value)) {
    return "{}";
  }
  return JSON.stringify(value, null, 2);
}

export function parsePluginConfigDraft(rawValue: string): {
  value: Record<string, unknown>;
  error: string | null;
} {
  return parseJsonObjectDraft(
    rawValue,
    "Plugin config must be a JSON object.",
    "Plugin config JSON is invalid.",
  );
}

export function formatPluginConfigDraft(value: unknown): string {
  return formatJsonObjectDraft(value);
}

export function getPluginCapabilityStatus(
  pluginStatus: PluginStatusEntry | null,
  pluginListEntry: PluginListEntry,
  capability: string,
): PluginCapabilityStatus {
  const capabilityStatusIndex = buildCapabilityStatusIndex({
    requestedCapabilities: pluginStatus?.requestedCapabilities ?? [],
    effectiveCapabilities:
      pluginStatus?.effectiveCapabilities ??
      pluginListEntry.effectiveCapabilities,
    blockedCapabilities: pluginStatus?.blockedCapabilities ?? [],
    capabilityList: [capability],
  });
  return (
    capabilityStatusIndex.capabilityStatusByCapability.get(capability) ??
    "not_requested"
  );
}

export function getBlockedCapabilityReason(
  blockedCapabilities: PluginBlockedCapability[],
  capability: string,
): string | null {
  const capabilityStatusIndex = buildCapabilityStatusIndex({
    requestedCapabilities: [],
    effectiveCapabilities: [],
    blockedCapabilities,
    capabilityList: [capability],
  });
  return (
    capabilityStatusIndex.blockedReasonByCapability.get(capability) ?? null
  );
}

export function buildCapabilityUnavailableMessage({
  capability,
  status,
  reason,
  serverMode,
}: {
  capability: string;
  status: PluginCapabilityStatus;
  reason: string | null;
  serverMode: string;
}): string {
  if (status === "blocked") {
    if (reason === "mode_policy") {
      return `${capability} is blocked by mode policy in ${serverMode} mode.`;
    }
    if (reason) {
      return `${capability} is blocked (${reason}).`;
    }
    return `${capability} is blocked.`;
  }
  if (status === "requested_unavailable") {
    return `${capability} was requested but is not effective in this runtime.`;
  }
  if (status === "effective") {
    return `${capability} is effective.`;
  }
  return `${capability} is not requested by this plugin.`;
}

export function validateInstallSourceSpec(
  sourceSpecRaw: string,
): string | null {
  const sourceSpec = sourceSpecRaw.trim();
  if (!sourceSpec) {
    return "Source spec is required.";
  }

  if (sourceSpec.startsWith("github:")) {
    const value = sourceSpec.slice("github:".length).trim();
    if (!value || !value.includes("/")) {
      return (
        "Invalid github source spec. Expected github:owner/repo[#ref] " +
        "or github:owner/repo@ref."
      );
    }
    return null;
  }

  if (sourceSpec.startsWith("pypi:")) {
    const value = sourceSpec.slice("pypi:".length).trim();
    if (!value) {
      return "Invalid pypi source spec. Expected pypi:package or pypi:package==version.";
    }
    return null;
  }

  return "Unsupported source spec. Use github: or pypi:.";
}

export function buildInstallTrustSummaryMessage(
  installSummary: Pick<PluginInstallResponse, "trustStatus" | "trustWarning">,
): string {
  return `Trust (${installSummary.trustStatus}): ${installSummary.trustWarning}`;
}

export function buildSourceManagerGuidanceMessage(
  plugin: Pick<PluginListEntry, "sourceManager" | "sourceManagerHint">,
): string {
  if (plugin.sourceManager === "package_manager") {
    if (plugin.sourceManagerHint && plugin.sourceManagerHint.trim() !== "") {
      return plugin.sourceManagerHint;
    }
    return "Use uv/pip/Poetry to install, update, or remove this plugin.";
  }
  return "Managed by Setta installer.";
}

export function isLinkedLocalPluginSource(
  plugin: Pick<PluginListEntry, "sourceManager" | "canonicalSourceKey">,
): boolean {
  if (plugin.sourceManager !== "setta") {
    return false;
  }
  return plugin.canonicalSourceKey.startsWith("local:");
}

export function buildPluginSourceIdentityToken(
  plugin: Pick<
    PluginListEntry,
    "sourceScope" | "canonicalSourceKey" | "sourceDigestSha256"
  >,
): string {
  const digest = plugin.sourceDigestSha256 ?? "none";
  return `${plugin.sourceScope}:${plugin.canonicalSourceKey}:${digest}`;
}

export function buildPluginListEntryCardKey(
  plugin: Pick<
    PluginListEntry,
    | "pluginId"
    | "version"
    | "sourceScope"
    | "canonicalSourceKey"
    | "sourceDigestSha256"
  >,
): string {
  return `${plugin.pluginId}:${plugin.version}:${buildPluginSourceIdentityToken(plugin)}`;
}

export function buildBusyPluginIdSet(actionKeys: Set<string>): Set<string> {
  const ids = new Set<string>();
  for (const actionKey of actionKeys) {
    const separatorIndex = actionKey.indexOf(":");
    if (separatorIndex < 0 || separatorIndex >= actionKey.length - 1) {
      continue;
    }
    ids.add(actionKey.slice(separatorIndex + 1));
  }
  return ids;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  return true;
}
