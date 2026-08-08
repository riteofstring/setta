import { getErrorDetail } from "@setta/app-subsystem-frontend-sdk";
import {
  type PluginBlockedCapability,
  type PluginInstallResponse,
  type PluginListEntry,
} from "utils/generatedTypes";

type PluginCapabilityStatus =
  | "effective"
  | "blocked"
  | "requested_unavailable"
  | "not_requested";

type PluginCapabilityStatusIndex = {
  capabilityStatusByCapability: Map<string, PluginCapabilityStatus>;
  blockedReasonByCapability: Map<string, string>;
};

export type PluginConfigFieldDefinition = {
  key: string;
  required: boolean;
  schema: Record<string, unknown>;
};

type PluginConfigFieldPresentation = {
  value: unknown;
  displayLabelText: string;
  descriptionText: string | null;
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

export function resolvePluginConfigFieldPresentation(
  field: PluginConfigFieldDefinition,
  config: Record<string, unknown>,
): PluginConfigFieldPresentation {
  const configuredValue = config[field.key];
  const labelText =
    normalizeOptionalSchemaText(field.schema.title) ?? field.key;
  return {
    value:
      configuredValue === undefined ? field.schema.default : configuredValue,
    displayLabelText: field.required ? `${labelText} *` : labelText,
    descriptionText: normalizeOptionalSchemaText(field.schema.description),
  };
}

export function getPluginActionErrorDetail(data: unknown): string | null {
  const detailMessage = getErrorDetail(data);
  if (detailMessage) {
    return detailMessage;
  }
  if (!isPlainObject(data)) {
    return null;
  }
  const detailValue = data.detail;
  if (!isPlainObject(detailValue)) {
    return null;
  }
  const code = detailValue.code;
  const message = detailValue.message;
  if (typeof code !== "string" || typeof message !== "string") {
    return null;
  }
  return `${code} - ${message}`;
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

function normalizeOptionalSchemaText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
