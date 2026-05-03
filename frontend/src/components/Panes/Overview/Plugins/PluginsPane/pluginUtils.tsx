import { type ResponseDataAndStatus } from "@setta/app-subsystem-frontend-sdk";

import type { PluginBlockedCapability } from "utils/generatedTypes";

import {
  buildInstallTrustSummaryMessage,
  getPluginActionErrorDetail,
} from "../PluginsPane.helpers";

import {
  PluginActionStatus,
  PluginInstallSummary,
  cachedBlockedCapabilitiesTooltipText,
  cachedCapabilitiesTooltipText,
  cachedFormattedBlockedCapabilitiesText,
  cachedFormattedCapabilitiesText,
} from "./installAndDiscovery";

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  return true;
}

export function InstallSummaryCard({
  installSummary,
}: {
  installSummary: PluginInstallSummary;
}) {
  const requestedCapabilities = formatCapabilitiesForTable(
    installSummary.requestedCapabilities,
  );
  const sourceDigest = installSummary.sourceDigestSha256 ?? "unavailable";
  return (
    <section
      data-testid="plugin-install-confirmation"
      className="rounded-md border border-setta-200 bg-white p-2 dark:border-setta-850 dark:bg-setta-900"
    >
      <h3 className="text-xs font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
        Install Confirmation
      </h3>
      <p className="mt-1 font-mono text-[11px] text-setta-800 dark:text-setta-100">
        {installSummary.pluginId}@{installSummary.version}
      </p>
      <p className="mt-1 text-[11px] text-setta-600 dark:text-setta-300">
        scope={installSummary.sourceScopeLabel} source=
        {installSummary.canonicalSourceKey}
      </p>
      <p className="mt-1 text-[11px] text-setta-600 dark:text-setta-300">
        requested={requestedCapabilities}
      </p>
      <p className="mt-1 text-[11px] text-setta-600 dark:text-setta-300">
        sourceDigestSha256={sourceDigest}
      </p>
      <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
        {buildInstallTrustSummaryMessage(installSummary)}
      </p>
    </section>
  );
}

export function ActionButton({
  label,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  onClick: () => void | Promise<void>;
  disabled: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      className="rounded border border-setta-300 px-2 py-1 text-[11px] text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
      onClick={() => {
        void onClick();
      }}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

export function buildPluginActionError<T>(
  actionLabel: string,
  response: ResponseDataAndStatus<T>,
): string {
  if (!response.hasResponse) {
    return `${actionLabel} failed: network error.`;
  }
  const detailMessage = getPluginActionErrorDetail(response.data);
  if (detailMessage) {
    return `${actionLabel} failed: ${detailMessage}`;
  }
  return `${actionLabel} failed (status ${response.status ?? "unknown"}).`;
}

export function buildPluginActionThrownError(
  actionLabel: string,
  error: unknown,
): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0) {
      return `${actionLabel} failed: ${message}`;
    }
  }
  return `${actionLabel} failed: unexpected error.`;
}

function formatCapabilitiesForTable(capabilities: string[]): string {
  if (capabilities.length === 0) {
    return "none";
  }
  return [...capabilities].sort((a, b) => a.localeCompare(b)).join(", ");
}

export function formatCapabilitiesForTableCached(
  capabilities: string[],
): string {
  const cached = cachedFormattedCapabilitiesText.get(capabilities);
  if (cached) {
    return cached;
  }
  const formatted = formatCapabilitiesForTable(capabilities);
  cachedFormattedCapabilitiesText.set(capabilities, formatted);
  return formatted;
}

export function formatCapabilitiesTooltip(capabilities: string[]): string {
  const cached = cachedCapabilitiesTooltipText.get(capabilities);
  if (cached) {
    return cached;
  }
  const formatted =
    capabilities.length === 0 ? "none" : capabilities.join(", ");
  cachedCapabilitiesTooltipText.set(capabilities, formatted);
  return formatted;
}

function formatBlockedCapabilitiesForTable(
  blockedCapabilities: PluginBlockedCapability[],
): string {
  if (blockedCapabilities.length === 0) {
    return "none";
  }
  return [...blockedCapabilities]
    .sort((a, b) => {
      const byCapability = a.capability.localeCompare(b.capability);
      if (byCapability !== 0) {
        return byCapability;
      }
      return a.reason.localeCompare(b.reason);
    })
    .map(
      (blockedCapability) =>
        `${blockedCapability.capability} (${blockedCapability.reason})`,
    )
    .join(", ");
}

export function formatBlockedCapabilitiesForTableCached(
  blockedCapabilities: PluginBlockedCapability[],
): string {
  const cached =
    cachedFormattedBlockedCapabilitiesText.get(blockedCapabilities);
  if (cached) {
    return cached;
  }
  const formatted = formatBlockedCapabilitiesForTable(blockedCapabilities);
  cachedFormattedBlockedCapabilitiesText.set(blockedCapabilities, formatted);
  return formatted;
}

export function formatBlockedCapabilitiesTooltip(
  blockedCapabilities: PluginBlockedCapability[],
): string {
  const cached = cachedBlockedCapabilitiesTooltipText.get(blockedCapabilities);
  if (cached) {
    return cached;
  }
  const formatted =
    blockedCapabilities.length === 0
      ? "none"
      : blockedCapabilities
          .map(
            (blockedCapability) =>
              `${blockedCapability.capability} (${blockedCapability.reason})`,
          )
          .join(", ");
  cachedBlockedCapabilitiesTooltipText.set(blockedCapabilities, formatted);
  return formatted;
}

export function getActionStatusClassName(
  type: PluginActionStatus["type"],
): string {
  if (type === "error") {
    return (
      "border-red-300 bg-red-50 text-red-700 " +
      "dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
    );
  }
  if (type === "warning") {
    return (
      "border-yellow-300 bg-yellow-50 text-yellow-800 " +
      "dark:border-yellow-900/50 dark:bg-yellow-950/40 dark:text-yellow-200"
    );
  }
  return (
    "border-green-300 bg-green-50 text-green-700 " +
    "dark:border-green-900/40 dark:bg-green-950/40 dark:text-green-300"
  );
}
