import type {
  PluginBlockedCapability,
  PluginInstallResponse,
  PluginListEntry,
  PluginStatusEntry,
} from "utils/generatedTypes";

type PluginRegisteredLanguageServer =
  PluginStatusEntry["registeredLanguageServers"][number];
type PluginRegisteredExternalAgentAdapter =
  PluginStatusEntry["registeredExternalAgentAdapters"][number];
type PluginRegisteredCodegenTarget =
  PluginStatusEntry["registeredCodegenTargets"][number];

const cachedLanguageServersByStatus = new WeakMap<
  PluginStatusEntry,
  PluginRegisteredLanguageServer[]
>();
const cachedExternalAgentAdaptersByStatus = new WeakMap<
  PluginStatusEntry,
  PluginRegisteredExternalAgentAdapter[]
>();
const cachedCodegenTargetsByStatus = new WeakMap<
  PluginStatusEntry,
  PluginRegisteredCodegenTarget[]
>();

export type PluginCapabilityStatus =
  | "effective"
  | "blocked"
  | "requested_unavailable"
  | "not_requested";

export function getRegisteredLanguageServers(
  pluginStatus: PluginStatusEntry | null,
): PluginRegisteredLanguageServer[] {
  if (pluginStatus === null) {
    return [];
  }
  const cached = cachedLanguageServersByStatus.get(pluginStatus);
  if (cached) {
    return cached;
  }
  const registrations = Array.isArray(pluginStatus.registeredLanguageServers)
    ? [...pluginStatus.registeredLanguageServers]
    : [];
  registrations.sort((a, b) => {
    const byLanguage = a.language.localeCompare(b.language);
    if (byLanguage !== 0) {
      return byLanguage;
    }
    return a.name.localeCompare(b.name);
  });
  cachedLanguageServersByStatus.set(pluginStatus, registrations);
  return registrations;
}

export function getRegisteredExternalAgentAdapters(
  pluginStatus: PluginStatusEntry | null,
): PluginRegisteredExternalAgentAdapter[] {
  if (pluginStatus === null) {
    return [];
  }
  const cached = cachedExternalAgentAdaptersByStatus.get(pluginStatus);
  if (cached) {
    return cached;
  }
  const registrations = Array.isArray(
    pluginStatus.registeredExternalAgentAdapters,
  )
    ? [...pluginStatus.registeredExternalAgentAdapters]
    : [];
  registrations.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return a.adapterId.localeCompare(b.adapterId);
  });
  cachedExternalAgentAdaptersByStatus.set(pluginStatus, registrations);
  return registrations;
}

export function getRegisteredCodegenTargets(
  pluginStatus: PluginStatusEntry | null,
): PluginRegisteredCodegenTarget[] {
  if (pluginStatus === null) {
    return [];
  }
  const cached = cachedCodegenTargetsByStatus.get(pluginStatus);
  if (cached) {
    return cached;
  }
  const registrations = Array.isArray(pluginStatus.registeredCodegenTargets)
    ? [...pluginStatus.registeredCodegenTargets]
    : [];
  registrations.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return a.targetId.localeCompare(b.targetId);
  });
  cachedCodegenTargetsByStatus.set(pluginStatus, registrations);
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

export function parseLanguageServerSettingsDraft(rawValue: string): {
  value: Record<string, unknown>;
  error: string | null;
} {
  return parseJsonObjectDraft(
    rawValue,
    "Language server settings must be a JSON object.",
    "Language server settings JSON is invalid.",
  );
}

export function formatLanguageServerSettingsDraft(value: unknown): string {
  return formatJsonObjectDraft(value);
}

export function getLanguageServerSettingsValue(
  settings: Record<string, unknown>,
  settingsKey: string,
): unknown {
  const path = settingsKey
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (path.length === 0) {
    return {};
  }
  let current: unknown = settings;
  for (const segment of path) {
    if (!isPlainObject(current)) {
      return {};
    }
    current = current[segment];
  }
  return current ?? {};
}

export function setLanguageServerSettingsValue(
  settings: Record<string, unknown>,
  settingsKey: string,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const path = settingsKey
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (path.length === 0) {
    return { ...settings };
  }
  const [head, ...tail] = path;
  if (!head) {
    return { ...settings };
  }
  if (tail.length === 0) {
    return {
      ...settings,
      [head]: { ...value },
    };
  }
  const existing = settings[head];
  const nextChild = setLanguageServerSettingsValue(
    isPlainObject(existing) ? existing : {},
    tail.join("."),
    value,
  );
  return {
    ...settings,
    [head]: nextChild,
  };
}

export function getPluginCapabilityStatus(
  pluginStatus: PluginStatusEntry | null,
  pluginListEntry: PluginListEntry,
  capability: string,
): PluginCapabilityStatus {
  const requestedCapabilities = pluginStatus?.requestedCapabilities ?? [];
  const effectiveCapabilities =
    pluginStatus?.effectiveCapabilities ??
    pluginListEntry.effectiveCapabilities;
  if (!requestedCapabilities.includes(capability)) {
    return "not_requested";
  }
  if (effectiveCapabilities.includes(capability)) {
    return "effective";
  }
  const reason = getBlockedCapabilityReason(
    pluginStatus?.blockedCapabilities ?? [],
    capability,
  );
  if (reason) {
    return "blocked";
  }
  return "requested_unavailable";
}

export function getBlockedCapabilityReason(
  blockedCapabilities: PluginBlockedCapability[],
  capability: string,
): string | null {
  for (const blockedCapability of blockedCapabilities) {
    if (blockedCapability.capability === capability) {
      return blockedCapability.reason;
    }
  }
  return null;
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

export function validateInstallSourceSpec(sourceSpecRaw: string): string | null {
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
