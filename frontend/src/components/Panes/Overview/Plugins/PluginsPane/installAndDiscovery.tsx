import { type ResponseDataAndStatus } from "@setta/app-subsystem-frontend-sdk";

import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";

import { buildPluginRestartActionPlan } from "plugins/restart";

import {
  refreshPluginRuntime,
  usePluginRuntimeStore,
  type PluginServerMode,
} from "plugins/runtime";

import { useMemo, type ReactNode } from "react";

import type {
  LanguageServerSelectionStatus,
  PluginBlockedCapability,
  PluginInstallResponse,
  PluginInstallerBackend,
  PluginListEntry,
  PluginRestartCapability,
  PluginScope,
  PluginStatusEntry,
} from "utils/generatedTypes";

import {
  LanguageServerSelectionSeverityEnum,
  PluginInstallerBackendEnum,
  PluginScopeEnum,
} from "utils/generatedTypes";

import { buildPluginListEntryCardKey } from "../PluginsPane.helpers";

import { PluginListEntryCard } from "./pluginConfigEditor";

import {
  ActionButton,
  formatBlockedCapabilitiesForTableCached,
  formatBlockedCapabilitiesTooltip,
  formatCapabilitiesForTableCached,
  formatCapabilitiesTooltip,
  getActionStatusClassName,
} from "./pluginUtils";

export type PluginActionStatus = {
  type: "error" | "success" | "warning";
  message: string;
};

export type InstallScope = PluginScope;

export type InstallBackend = PluginInstallerBackend;

export type PluginInstallSummary = PluginInstallResponse;

export type PluginPaneSummary = {
  id: string;
  title: string;
  description?: string;
  icon?: string;
};

export type PluginCommandSummary = {
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
};

export type PluginListEntryCardRuntimeState = {
  serverMode: PluginServerMode;
  pluginStatus: PluginStatusEntry | null;
  panes: readonly PluginPaneSummary[];
  commands: readonly PluginCommandSummary[];
  frontendError: {
    code: string;
    message: string;
  } | null;
};

type PluginsPaneRuntimeSummary = {
  status: string;
  statusMessage: string | null;
  restartCapability: PluginRestartCapability | null;
  serverMode: PluginServerMode;
};

export const EMPTY_PLUGIN_PANES: readonly PluginPaneSummary[] = [];

export const EMPTY_PLUGIN_COMMANDS: readonly PluginCommandSummary[] = [];

export const DEFAULT_PLUGIN_SERVER_MODE: PluginServerMode = "ide";

export const PYTHON_LANGUAGE_ID = "python";

const PYTHON_LANGUAGE_SERVER_NONE_OPTION_ID = "__python_lsp_none__";

export const cachedFormattedCapabilitiesText = new WeakMap<string[], string>();

export const cachedCapabilitiesTooltipText = new WeakMap<string[], string>();

export const cachedFormattedBlockedCapabilitiesText = new WeakMap<
  PluginBlockedCapability[],
  string
>();

export const cachedBlockedCapabilitiesTooltipText = new WeakMap<
  PluginBlockedCapability[],
  string
>();

function buildPythonLanguageServerOptions(
  selectionStatus: LanguageServerSelectionStatus | null,
): Array<{ id: string; name: string }> {
  const options = [
    {
      id: PYTHON_LANGUAGE_SERVER_NONE_OPTION_ID,
      name: "No Python language server",
    },
  ];
  const providers = selectionStatus?.availableProviders ?? [];
  for (const provider of providers) {
    if (provider.pluginId.trim() === "") {
      continue;
    }
    options.push({
      id: provider.pluginId,
      name: provider.available
        ? provider.name
        : `${provider.name} (unavailable)`,
    });
  }
  return options;
}

export function pluginListEntryCardRuntimeStateEqual(
  a: PluginListEntryCardRuntimeState,
  b: PluginListEntryCardRuntimeState,
): boolean {
  return (
    a.serverMode === b.serverMode &&
    a.pluginStatus === b.pluginStatus &&
    a.panes === b.panes &&
    a.commands === b.commands &&
    a.frontendError === b.frontendError
  );
}

export function pluginsPaneRuntimeSummaryEqual(
  a: PluginsPaneRuntimeSummary,
  b: PluginsPaneRuntimeSummary,
): boolean {
  return (
    a.status === b.status &&
    a.statusMessage === b.statusMessage &&
    a.restartCapability === b.restartCapability &&
    a.serverMode === b.serverMode
  );
}

export function updateBusyActionKeySet(
  previous: Set<string>,
  actionKey: string,
  busy: boolean,
): Set<string> {
  if (previous.has(actionKey) === busy) {
    return previous;
  }
  const next = new Set(previous);
  if (busy) {
    next.add(actionKey);
  } else {
    next.delete(actionKey);
  }
  return next;
}

export async function refreshPluginRuntimeWithWarning(
  actionLabel: string,
): Promise<string | null> {
  await refreshPluginRuntime();
  const runtimeState = usePluginRuntimeStore.getState();
  if (runtimeState.status !== "error") {
    return null;
  }
  const runtimeStatusMessage = runtimeState.statusMessage?.trim();
  const detail =
    runtimeStatusMessage && runtimeStatusMessage.length > 0
      ? runtimeStatusMessage
      : "unknown runtime error.";
  return `${actionLabel} completed, but runtime refresh failed: ${detail}`;
}

export function PluginsPaneRuntimeCard({
  runtimeSummary,
  writeActionsLocked,
  rescanBusy,
  restartBusy,
  restartActionPlan,
  onRescan,
  onRestart,
}: {
  runtimeSummary: PluginsPaneRuntimeSummary;
  writeActionsLocked: boolean;
  rescanBusy: boolean;
  restartBusy: boolean;
  restartActionPlan: ReturnType<typeof buildPluginRestartActionPlan>;
  onRescan: () => void | Promise<void>;
  onRestart: () => void | Promise<void>;
}) {
  return (
    <section className="rounded-md border border-setta-200 bg-white p-2 dark:border-setta-850 dark:bg-setta-900">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
          Plugin Runtime
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
            onClick={() => {
              void onRescan();
            }}
            disabled={writeActionsLocked || rescanBusy}
          >
            Rescan
          </button>
          <button
            type="button"
            className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
            onClick={() => {
              void onRestart();
            }}
            disabled={
              writeActionsLocked ||
              restartBusy ||
              restartActionPlan.mode === "unavailable"
            }
          >
            Restart Setta
          </button>
        </div>
      </header>
      <p className="text-[11px] text-setta-600 dark:text-setta-300">
        mode={runtimeSummary.serverMode} status={runtimeSummary.status}
      </p>
      {runtimeSummary.restartCapability ? (
        <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
          restart capability: {runtimeSummary.restartCapability.mode}
          {runtimeSummary.restartCapability.command
            ? ` (${runtimeSummary.restartCapability.command})`
            : ""}
        </p>
      ) : null}
      {runtimeSummary.statusMessage ? (
        <p className="mt-1 text-[11px] text-red-700 dark:text-red-300">
          {runtimeSummary.statusMessage}
        </p>
      ) : null}
    </section>
  );
}

export function PluginsPaneRestartRequiredNotice({
  restartRequiredPluginIds,
  restartActionPlan,
}: {
  restartRequiredPluginIds: string[];
  restartActionPlan: ReturnType<typeof buildPluginRestartActionPlan>;
}) {
  if (restartRequiredPluginIds.length === 0) {
    return null;
  }
  return (
    <section className="rounded-md border border-yellow-300 bg-yellow-50 p-2 text-[11px] text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-950/40 dark:text-yellow-200">
      <p className="font-semibold uppercase tracking-wide">Restart required</p>
      <p className="mt-1">
        Backend changes are pending for: {restartRequiredPluginIds.join(", ")}
      </p>
      {restartActionPlan.mode === "manual" ? (
        <p className="mt-1">
          Manual command: <code>{restartActionPlan.command}</code>
        </p>
      ) : null}
    </section>
  );
}

export function PluginsPaneInstallSection({
  sourceSpec,
  scope,
  installer,
  enableAfterInstall,
  disabled,
  onSourceSpecChange,
  onScopeChange,
  onInstallerChange,
  onEnableAfterInstallChange,
  onInstall,
}: {
  sourceSpec: string;
  scope: InstallScope;
  installer: InstallBackend;
  enableAfterInstall: boolean;
  disabled: boolean;
  onSourceSpecChange: (value: string) => void;
  onScopeChange: (value: InstallScope) => void;
  onInstallerChange: (value: InstallBackend) => void;
  onEnableAfterInstallChange: (value: boolean) => void;
  onInstall: () => void | Promise<void>;
}) {
  return (
    <section className="rounded-md border border-setta-200 bg-white p-2 dark:border-setta-850 dark:bg-setta-900">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
        Install Plugin
      </h3>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={sourceSpec}
          onChange={(event) => onSourceSpecChange(event.target.value)}
          placeholder="github:owner/repo[#ref] or pypi:package[==version]"
          className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
          disabled={disabled}
        />
        <div className="flex items-center gap-2">
          <select
            value={scope}
            onChange={(event) =>
              onScopeChange(event.target.value as InstallScope)
            }
            data-testid="plugin-install-scope"
            className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
            disabled={disabled}
          >
            <option value={PluginScopeEnum.workspace}>
              {PluginScopeEnum.workspace}
            </option>
            <option value={PluginScopeEnum.setta_files}>
              {PluginScopeEnum.setta_files}
            </option>
            <option value={PluginScopeEnum.global}>
              {PluginScopeEnum.global}
            </option>
          </select>
          <select
            value={installer}
            onChange={(event) =>
              onInstallerChange(event.target.value as InstallBackend)
            }
            data-testid="plugin-install-installer"
            className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
            disabled={disabled}
          >
            <option value={PluginInstallerBackendEnum.auto}>
              {PluginInstallerBackendEnum.auto}
            </option>
            <option value={PluginInstallerBackendEnum.pip}>
              {PluginInstallerBackendEnum.pip}
            </option>
            <option value={PluginInstallerBackendEnum.uv}>
              {PluginInstallerBackendEnum.uv}
            </option>
          </select>
          <label className="flex items-center gap-1 text-[11px] text-setta-600 dark:text-setta-300">
            <input
              type="checkbox"
              checked={enableAfterInstall}
              onChange={(event) =>
                onEnableAfterInstallChange(event.target.checked)
              }
              disabled={disabled}
            />
            enable after install
          </label>
          <button
            type="button"
            className="ml-auto rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
            onClick={() => {
              void onInstall();
            }}
            disabled={disabled}
          >
            Install
          </button>
        </div>
        <p className="text-[11px] text-setta-500 dark:text-setta-400">
          {disabled ? (
            "Plugin install/uninstall/update actions are IDE-mode only."
          ) : (
            <>
              Supported sources: <code>github:</code> and <code>pypi:</code>.
              Installer <code>auto</code> prefers <code>uv</code> when
              available, otherwise <code>pip</code>.
            </>
          )}
        </p>
      </div>
    </section>
  );
}

export function PluginsPaneActionStatusNotice({
  actionStatus,
}: {
  actionStatus: PluginActionStatus | null;
}) {
  if (!actionStatus) {
    return null;
  }
  return (
    <section
      className={`rounded-md border p-2 text-[11px] ${getActionStatusClassName(actionStatus.type)}`}
    >
      {actionStatus.message}
    </section>
  );
}

function getLanguageServerSelectionNoticeClassName(
  selectionStatus: LanguageServerSelectionStatus | null,
): string {
  if (
    selectionStatus?.severity === LanguageServerSelectionSeverityEnum.success
  ) {
    return "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-950/40 dark:text-green-200";
  }
  if (
    selectionStatus?.severity === LanguageServerSelectionSeverityEnum.warning
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200";
  }
  return "border-setta-200 bg-setta-50/70 text-setta-700 dark:border-setta-800 dark:bg-setta-950/40 dark:text-setta-200";
}

function normalizePythonLanguageServerSelectionValue(
  nextValue: string | null,
): string | null {
  return nextValue === PYTHON_LANGUAGE_SERVER_NONE_OPTION_ID ||
    nextValue === null
    ? null
    : nextValue;
}

export function PythonLanguageServerSection({
  selectionStatus,
  disabled,
  selectionBusy,
  restartBusy,
  onSelectPythonLanguageServer,
  onRestartLanguageServer,
}: {
  selectionStatus: LanguageServerSelectionStatus | null;
  disabled: boolean;
  selectionBusy: boolean;
  restartBusy: boolean;
  onSelectPythonLanguageServer: (pluginId: string | null) => Promise<void>;
  onRestartLanguageServer: () => Promise<void>;
}) {
  const pythonLanguageServerOptions = useMemo(
    () => buildPythonLanguageServerOptions(selectionStatus),
    [selectionStatus],
  );
  const comboboxValue =
    selectionStatus?.selectedPluginId ?? PYTHON_LANGUAGE_SERVER_NONE_OPTION_ID;
  const noticeClassName =
    getLanguageServerSelectionNoticeClassName(selectionStatus);

  return (
    <section className="rounded-md border border-setta-200 bg-white p-2 dark:border-setta-850 dark:bg-setta-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
            Python Language Server
          </h3>
          <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
            Workspace selection and health come from backend-owned plugin
            runtime state.
          </p>
        </div>
        {selectionStatus?.restartRequired ? (
          <ActionButton
            label="Restart Language Server"
            onClick={onRestartLanguageServer}
            disabled={disabled || restartBusy}
            testId="python-language-server-restart"
          />
        ) : null}
      </div>
      <div className="mt-2">
        <IdNameCombobox
          allItems={[
            {
              groupName: "Python language server",
              items: pythonLanguageServerOptions,
            },
          ]}
          value={comboboxValue}
          onSelectedItemChange={(nextValue) =>
            onSelectPythonLanguageServer(
              normalizePythonLanguageServerSelectionValue(nextValue),
            )
          }
          placeholder="Select a Python language server"
          outerDivClasses="w-full"
          inputDivId="python-language-server-selector"
          variant="pane"
          bg=""
          isDisabled={disabled || selectionBusy}
        />
      </div>
      <section
        data-testid="python-language-server-selection-summary"
        className={`mt-2 rounded border p-2 text-[11px] ${noticeClassName}`}
      >
        {selectionStatus?.message ??
          "Python language-server status is unavailable."}
      </section>
    </section>
  );
}

export function ActivePluginsSection({
  pluginListEntries,
  isSettingsProject,
  pythonSelectionStatus,
  writeActionsLocked,
  isAnyPluginActionBusy,
  runEnablePlugin,
  runDisablePlugin,
  selectPythonLanguageServer,
  runAction,
}: {
  pluginListEntries: PluginListEntry[];
  isSettingsProject: boolean;
  pythonSelectionStatus: LanguageServerSelectionStatus | null;
  writeActionsLocked: boolean;
  isAnyPluginActionBusy: (pluginId: string) => boolean;
  runEnablePlugin: (pluginId: string) => Promise<void>;
  runDisablePlugin: (pluginId: string) => Promise<void>;
  selectPythonLanguageServer: (pluginId: string) => Promise<void>;
  runAction: <T>(
    actionKey: string,
    actionLabel: string,
    operation: () => Promise<ResponseDataAndStatus<T>>,
  ) => Promise<ResponseDataAndStatus<T> | null>;
}) {
  return (
    <section className="rounded-md border border-setta-200 bg-white p-2 dark:border-setta-850 dark:bg-setta-900">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
        Active Plugins ({pluginListEntries.length})
      </h3>
      {pluginListEntries.length === 0 ? (
        <p className="text-xs text-setta-500 dark:text-setta-400">
          No active plugins discovered.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {pluginListEntries.map((plugin) => (
            <PluginListEntryCard
              key={buildPluginListEntryCardKey(plugin)}
              plugin={plugin}
              isSettingsProject={isSettingsProject}
              pythonSelectionStatus={pythonSelectionStatus}
              writeActionsLocked={writeActionsLocked}
              isAnyPluginActionBusy={isAnyPluginActionBusy}
              runEnablePlugin={runEnablePlugin}
              runDisablePlugin={runDisablePlugin}
              selectPythonLanguageServer={selectPythonLanguageServer}
              runAction={runAction}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function PluginDiscoveryStatusSection({
  pluginStatusEntries,
  renderStatusRowAction,
}: {
  pluginStatusEntries: PluginStatusEntry[];
  renderStatusRowAction: (entry: PluginStatusEntry) => ReactNode;
}) {
  return (
    <section className="rounded-md border border-setta-200 bg-white p-2 dark:border-setta-850 dark:bg-setta-900">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
        Discovery Status ({pluginStatusEntries.length})
      </h3>
      <div className="max-h-64 overflow-auto rounded border border-setta-200 dark:border-setta-800">
        {pluginStatusEntries.length === 0 ? (
          <div className="p-2 text-xs text-setta-500 dark:text-setta-400">
            No discovered plugins.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="sticky top-0 bg-setta-100 text-setta-700 dark:bg-setta-850 dark:text-setta-200">
              <tr>
                <th className="px-2 py-1 font-semibold">plugin</th>
                <th className="px-2 py-1 font-semibold">state</th>
                <th className="px-2 py-1 font-semibold">scope</th>
                <th className="px-2 py-1 font-semibold">requested</th>
                <th className="px-2 py-1 font-semibold">effective</th>
                <th className="px-2 py-1 font-semibold">blocked</th>
                <th className="px-2 py-1 font-semibold">source</th>
                <th className="px-2 py-1 font-semibold">actions</th>
              </tr>
            </thead>
            <tbody>
              {pluginStatusEntries.map((entry) => (
                <tr
                  key={`${entry.pluginId}:${entry.sourceScope}:${entry.sourcePath}`}
                  className="border-t border-setta-200 dark:border-setta-850"
                >
                  <td className="px-2 py-1 text-setta-800 dark:text-setta-100">
                    {entry.pluginId}
                  </td>
                  <td className="px-2 py-1">{entry.state}</td>
                  <td className="px-2 py-1">{entry.sourceScopeLabel}</td>
                  <td className="max-w-[150px] px-2 py-1 text-setta-600 dark:text-setta-300">
                    <span
                      title={formatCapabilitiesTooltip(
                        entry.requestedCapabilities,
                      )}
                    >
                      {formatCapabilitiesForTableCached(
                        entry.requestedCapabilities,
                      )}
                    </span>
                  </td>
                  <td className="max-w-[150px] px-2 py-1 text-setta-600 dark:text-setta-300">
                    <span
                      title={formatCapabilitiesTooltip(
                        entry.effectiveCapabilities,
                      )}
                    >
                      {formatCapabilitiesForTableCached(
                        entry.effectiveCapabilities,
                      )}
                    </span>
                  </td>
                  <td className="max-w-[170px] px-2 py-1 text-setta-600 dark:text-setta-300">
                    <span
                      title={formatBlockedCapabilitiesTooltip(
                        entry.blockedCapabilities,
                      )}
                    >
                      {formatBlockedCapabilitiesForTableCached(
                        entry.blockedCapabilities,
                      )}
                    </span>
                  </td>
                  <td
                    className="max-w-[220px] truncate px-2 py-1 text-setta-500 dark:text-setta-400"
                    title={entry.sourcePath}
                  >
                    {entry.sourcePath}
                  </td>
                  <td className="px-2 py-1">{renderStatusRowAction(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
