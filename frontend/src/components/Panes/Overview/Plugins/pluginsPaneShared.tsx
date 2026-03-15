import type { PluginInstallResponse } from "utils/generatedTypes";
import {
  buildInstallTrustSummaryMessage,
  formatCapabilitiesForTable,
} from "./PluginsPane.helpers";

export function ActionButton({
  label,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  onClick: () => Promise<void>;
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

export function CapabilityRow({
  label,
  entries,
  emptyLabel,
  className = "",
  tone = "default",
}: {
  label: string;
  entries: readonly string[];
  emptyLabel: string;
  className?: string;
  tone?: "default" | "blocked";
}) {
  const sortedEntries = [...entries].sort((a, b) => a.localeCompare(b));
  const badgeClassName =
    tone === "blocked"
      ? "rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
      : "rounded border border-setta-300 bg-setta-50 px-1.5 py-0.5 text-[10px] font-medium text-setta-700 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200";
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        {label}
      </p>
      {sortedEntries.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {sortedEntries.map((entry) => (
            <span key={`${label}:${entry}`} className={badgeClassName}>
              {entry}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}

export function InstallSummaryCard({
  installSummary,
}: {
  installSummary: PluginInstallResponse;
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
