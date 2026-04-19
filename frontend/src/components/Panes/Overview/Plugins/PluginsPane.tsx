import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import {
  disablePlugin,
  enablePlugin,
  installPlugin,
  rescanPlugins,
  restartLanguageServer,
  rollbackPlugin,
  setLanguageServerSelection,
  uninstallPlugin,
  updatePlugin,
  writePluginConfig,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  buildPluginRestartActionPlan,
  getRestartRequiredPluginIds,
  requestPluginRestart,
} from "plugins/restart";
import {
  refreshPluginRuntime,
  usePluginListEntries,
  usePluginRuntimeStore,
  usePluginStatusEntries,
  type PluginServerMode,
} from "plugins/runtime";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import { useProjectState, useShareSession } from "state/definitions";
import { C } from "utils/c";
import { buildPluginPaneOverviewTabName } from "utils/constants";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import type {
  LanguageServerSelectionStatus,
  PluginBlockedCapability,
  PluginInstallerBackend,
  PluginInstallResponse,
  PluginListEntry,
  PluginRestartCapability,
  PluginScope,
  PluginStatusEntry,
} from "utils/generatedTypes";
import {
  LanguageServerSelectionSeverityEnum,
  PluginInstallerBackendEnum,
  PluginRuntimeStateEnum,
  PluginScopeEnum,
} from "utils/generatedTypes";
import { onOverviewTabClick } from "../../paneFns";
import {
  buildBusyPluginIdSet,
  buildCapabilityStatusIndex,
  buildCapabilityUnavailableMessage,
  buildInstallTrustSummaryMessage,
  buildPluginListEntryCardKey,
  buildPluginSourceIdentityToken,
  buildSourceManagerGuidanceMessage,
  formatPluginConfigDraft,
  getPluginActionErrorDetail,
  isLinkedLocalPluginSource,
  parsePluginConfigDraft,
  resolvePluginConfigFieldPresentation,
  type PluginConfigFieldDefinition,
} from "./PluginsPane.helpers";
type PluginActionStatus = {
  type: "error" | "success" | "warning";
  message: string;
};
type InstallScope = PluginScope;
type InstallBackend = PluginInstallerBackend;
type PluginInstallSummary = PluginInstallResponse;
type PluginPaneSummary = {
  id: string;
  title: string;
  description?: string;
  icon?: string;
};
type PluginCommandSummary = {
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
};
type PluginListEntryCardRuntimeState = {
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
const EMPTY_PLUGIN_PANES: readonly PluginPaneSummary[] = [];
const EMPTY_PLUGIN_COMMANDS: readonly PluginCommandSummary[] = [];
const DEFAULT_PLUGIN_SERVER_MODE: PluginServerMode = "ide";
const PYTHON_LANGUAGE_ID = "python";
const PYTHON_LANGUAGE_SERVER_NONE_OPTION_ID = "__python_lsp_none__";
const cachedFormattedCapabilitiesText = new WeakMap<string[], string>();
const cachedCapabilitiesTooltipText = new WeakMap<string[], string>();
const cachedFormattedBlockedCapabilitiesText = new WeakMap<
  PluginBlockedCapability[],
  string
>();
const cachedBlockedCapabilitiesTooltipText = new WeakMap<
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

function pluginListEntryCardRuntimeStateEqual(
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
function pluginsPaneRuntimeSummaryEqual(
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

function updateBusyActionKeySet(
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

async function refreshPluginRuntimeWithWarning(
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

function PluginsPaneRuntimeCard({
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

function PluginsPaneRestartRequiredNotice({
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

function PluginsPaneInstallSection({
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

function PluginsPaneActionStatusNotice({
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

function PythonLanguageServerSection({
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

function ActivePluginsSection({
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

function PluginDiscoveryStatusSection({
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
export function PluginsPane() {
  const [sourceSpec, setSourceSpec] = useState("");
  const [scope, setScope] = useState<InstallScope>(PluginScopeEnum.workspace);
  const [installer, setInstaller] = useState<InstallBackend>(
    PluginInstallerBackendEnum.auto,
  );
  const [enableAfterInstall, setEnableAfterInstall] = useState(true);
  const [busyActionKeys, setBusyActionKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [actionStatus, setActionStatus] = useState<PluginActionStatus | null>(
    null,
  );
  const [installSummary, setInstallSummary] =
    useState<PluginInstallSummary | null>(null);
  const inFlightActionKeysRef = useRef<Set<string>>(new Set());
  const pluginListEntries = usePluginListEntries();
  const pluginStatusEntries = usePluginStatusEntries();
  const runtimeSummary = usePluginRuntimeStore(
    (state) => ({
      status: state.status,
      statusMessage: state.statusMessage,
      restartCapability: state.restartCapability,
      serverMode: state.serverMode ?? DEFAULT_PLUGIN_SERVER_MODE,
    }),
    pluginsPaneRuntimeSummaryEqual,
  );
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const pythonSelectionStatus = usePluginRuntimeStore(
    (state) => state.languageServerSelectionsByLanguage[PYTHON_LANGUAGE_ID],
  );
  const currentProjectConfigName = useProjectState(
    (state) => state.projectConfig.name,
  );
  const writeActionsLocked =
    runtimeSummary.serverMode !== "ide" || isDeploymentMode;
  const isSettingsProject =
    currentProjectConfigName.trim().toLowerCase() ===
    C.SETTINGS_PROJECT_NAME.toLowerCase();
  const busyPluginIds = useMemo(
    () => buildBusyPluginIdSet(busyActionKeys),
    [busyActionKeys],
  );
  const restartRequiredPluginIds = useMemo(
    () => getRestartRequiredPluginIds(pluginListEntries, pluginStatusEntries),
    [pluginListEntries, pluginStatusEntries],
  );
  const restartActionPlan = useMemo(
    () => buildPluginRestartActionPlan(runtimeSummary.restartCapability),
    [runtimeSummary.restartCapability],
  );
  const installActionsDisabled = writeActionsLocked || isActionBusy("install");
  async function runAction<T>(
    actionKey: string,
    actionLabel: string,
    operation: () => Promise<ResponseDataAndStatus<T>>,
    options?: {
      refreshRuntimeOnSuccess?: boolean;
    },
  ): Promise<ResponseDataAndStatus<T> | null> {
    const refreshRuntimeOnSuccess = options?.refreshRuntimeOnSuccess ?? true;
    if (inFlightActionKeysRef.current.has(actionKey)) {
      return null;
    }
    inFlightActionKeysRef.current.add(actionKey);
    setBusyActionKeys((previous) =>
      updateBusyActionKeySet(previous, actionKey, true),
    );
    setActionStatus(null);
    try {
      const response = await operation();
      if (!res200(response)) {
        const message = buildPluginActionError(actionLabel, response);
        setActionStatus({ type: "error", message });
        addTemporaryNotification(message, "error");
        return null;
      }
      if (refreshRuntimeOnSuccess) {
        const runtimeRefreshWarning =
          await refreshPluginRuntimeWithWarning(actionLabel);
        if (runtimeRefreshWarning) {
          setActionStatus({
            type: "warning",
            message: runtimeRefreshWarning,
          });
          return response;
        }
      }
      setActionStatus({
        type: "success",
        message: `${actionLabel} completed.`,
      });
      return response;
    } catch (error) {
      const message = buildPluginActionThrownError(actionLabel, error);
      setActionStatus({ type: "error", message });
      addTemporaryNotification(message, "error");
      return null;
    } finally {
      inFlightActionKeysRef.current.delete(actionKey);
      setBusyActionKeys((previous) =>
        updateBusyActionKeySet(previous, actionKey, false),
      );
    }
  }
  function isActionBusy(actionKey: string): boolean {
    return busyActionKeys.has(actionKey);
  }
  function isAnyPluginActionBusy(pluginId: string): boolean {
    return busyPluginIds.has(pluginId);
  }
  async function runEnablePlugin(pluginId: string) {
    await runAction(`enable:${pluginId}`, "Enable plugin", async () =>
      callOpenAPI(
        enablePlugin({ body: { pluginId } } as Parameters<
          typeof enablePlugin
        >[0]),
      ),
    );
  }
  async function runDisablePlugin(pluginId: string) {
    await runAction(`disable:${pluginId}`, "Disable plugin", async () =>
      callOpenAPI(
        disablePlugin({ body: { pluginId } } as Parameters<
          typeof disablePlugin
        >[0]),
      ),
    );
  }
  async function onSelectPythonLanguageServer(pluginId: string | null) {
    if (writeActionsLocked) {
      return;
    }
    if ((pythonSelectionStatus?.selectedPluginId ?? null) === pluginId) {
      return;
    }
    const response = await runAction(
      "python-language-server-selection",
      "Save Python language server selection",
      async () =>
        callOpenAPI(
          setLanguageServerSelection({
            body: {
              language: PYTHON_LANGUAGE_ID,
              pluginId: pluginId,
            },
          } as Parameters<typeof setLanguageServerSelection>[0]),
        ),
      {
        refreshRuntimeOnSuccess: false,
      },
    );
    if (!response) {
      return;
    }
    const message =
      pluginId === null
        ? "Python language server selection saved."
        : `Python language server selection saved. "${pluginId}" will be used after the next language-server restart.`;
    setActionStatus({
      type: "success",
      message,
    });
    addTemporaryNotification(message, "info");
  }
  async function onRestartLanguageServer() {
    if (writeActionsLocked) {
      return;
    }
    await runAction(
      "restart-language-server",
      "Restart language server",
      async () => callOpenAPI(restartLanguageServer()),
      {
        refreshRuntimeOnSuccess: false,
      },
    );
  }
  function renderStatusRowAction(entry: PluginStatusEntry) {
    if (entry.shadowedBySourcePath !== null) {
      return <span className="text-setta-400 dark:text-setta-500">-</span>;
    }
    const pluginActionBusy = isAnyPluginActionBusy(entry.pluginId);
    if (entry.state === "disabled") {
      return (
        <ActionButton
          label="Enable"
          onClick={() => runEnablePlugin(entry.pluginId)}
          disabled={writeActionsLocked || pluginActionBusy}
          testId={`plugin-status-enable-${entry.pluginId}`}
        />
      );
    }
    return (
      <ActionButton
        label="Disable"
        onClick={() => runDisablePlugin(entry.pluginId)}
        disabled={writeActionsLocked || pluginActionBusy}
        testId={`plugin-status-disable-${entry.pluginId}`}
      />
    );
  }
  async function onInstallPlugin() {
    setInstallSummary(null);
    const trimmedSourceSpec = sourceSpec.trim();
    const installRequest = {
      sourceSpec: trimmedSourceSpec,
      scope,
      installer,
      enable: enableAfterInstall,
      force: false,
    };
    const response = await runAction<PluginInstallResponse>(
      "install",
      "Install plugin",
      async () =>
        callOpenAPI(
          installPlugin({ body: installRequest } as Parameters<
            typeof installPlugin
          >[0]),
        ) as Promise<ResponseDataAndStatus<PluginInstallResponse>>,
    );
    if (!response || !response.data) {
      return;
    }
    setInstallSummary(response.data);
    setSourceSpec("");
  }
  async function onRescan() {
    if (writeActionsLocked) {
      return;
    }
    await runAction("rescan", "Rescan plugins", async () =>
      callOpenAPI(rescanPlugins()),
    );
  }
  async function onRestart() {
    if (writeActionsLocked) {
      return;
    }
    if (inFlightActionKeysRef.current.has("restart")) {
      return;
    }
    if (restartActionPlan.mode === "unavailable") {
      setActionStatus({
        type: "warning",
        message: restartActionPlan.message,
      });
      return;
    }
    if (restartActionPlan.mode === "manual") {
      setActionStatus({
        type: "warning",
        message: restartActionPlan.message,
      });
      addTemporaryNotification(
        `Manual restart required: ${restartActionPlan.command}`,
        "warning",
      );
      return;
    }
    inFlightActionKeysRef.current.add("restart");
    setBusyActionKeys((previous) => {
      if (previous.has("restart")) {
        return previous;
      }
      const next = new Set(previous);
      next.add("restart");
      return next;
    });
    setActionStatus(null);
    try {
      const restartResult = await requestPluginRestart();
      if (restartResult.kind === "accepted") {
        await refreshPluginRuntime();
        setActionStatus({
          type: "success",
          message: "Restart request accepted.",
        });
        addTemporaryNotification("Restart request accepted.", "info");
        return;
      }
      if (restartResult.kind === "request_failed") {
        setActionStatus({
          type: "error",
          message: restartResult.message,
        });
        addTemporaryNotification(restartResult.message, "error");
        return;
      }
      setActionStatus({
        type: "warning",
        message: restartResult.message,
      });
      addTemporaryNotification(restartResult.message, "warning");
    } catch (error) {
      const message = buildPluginActionThrownError(
        "Restart plugins runtime",
        error,
      );
      setActionStatus({ type: "error", message });
      addTemporaryNotification(message, "error");
    } finally {
      inFlightActionKeysRef.current.delete("restart");
      setBusyActionKeys((previous) => {
        if (!previous.has("restart")) {
          return previous;
        }
        const next = new Set(previous);
        next.delete("restart");
        return next;
      });
    }
  }
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2 overflow-y-auto pb-2">
      <PluginsPaneRuntimeCard
        runtimeSummary={runtimeSummary}
        writeActionsLocked={writeActionsLocked}
        rescanBusy={isActionBusy("rescan")}
        restartBusy={isActionBusy("restart")}
        restartActionPlan={restartActionPlan}
        onRescan={onRescan}
        onRestart={onRestart}
      />
      <PluginsPaneRestartRequiredNotice
        restartRequiredPluginIds={restartRequiredPluginIds}
        restartActionPlan={restartActionPlan}
      />
      <PythonLanguageServerSection
        selectionStatus={pythonSelectionStatus ?? null}
        disabled={writeActionsLocked}
        selectionBusy={isActionBusy("python-language-server-selection")}
        restartBusy={isActionBusy("restart-language-server")}
        onSelectPythonLanguageServer={onSelectPythonLanguageServer}
        onRestartLanguageServer={onRestartLanguageServer}
      />
      <PluginsPaneInstallSection
        sourceSpec={sourceSpec}
        scope={scope}
        installer={installer}
        enableAfterInstall={enableAfterInstall}
        disabled={installActionsDisabled}
        onSourceSpecChange={setSourceSpec}
        onScopeChange={setScope}
        onInstallerChange={setInstaller}
        onEnableAfterInstallChange={setEnableAfterInstall}
        onInstall={onInstallPlugin}
      />
      <PluginsPaneActionStatusNotice actionStatus={actionStatus} />
      {installSummary ? (
        <InstallSummaryCard installSummary={installSummary} />
      ) : null}
      <ActivePluginsSection
        pluginListEntries={pluginListEntries}
        isSettingsProject={isSettingsProject}
        pythonSelectionStatus={pythonSelectionStatus ?? null}
        writeActionsLocked={writeActionsLocked}
        isAnyPluginActionBusy={isAnyPluginActionBusy}
        runEnablePlugin={runEnablePlugin}
        runDisablePlugin={runDisablePlugin}
        selectPythonLanguageServer={async (pluginId: string) => {
          await onSelectPythonLanguageServer(pluginId);
        }}
        runAction={runAction}
      />
      <PluginDiscoveryStatusSection
        pluginStatusEntries={pluginStatusEntries}
        renderStatusRowAction={renderStatusRowAction}
      />
    </div>
  );
}
type PluginListEntryCardProps = {
  plugin: PluginListEntry;
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
};

function buildPluginToggleLabel(
  pluginStatus: PluginStatusEntry | null,
): "Enable" | "Disable" {
  return pluginStatus == null ||
    pluginStatus.state === PluginRuntimeStateEnum.disabled
    ? "Enable"
    : "Disable";
}

function buildPythonPluginSelectionState(
  pluginId: string,
  pythonSelectionStatus: LanguageServerSelectionStatus | null,
): {
  isSelectedForPython: boolean;
  canUseForPython: boolean;
} {
  const selectedPythonPlugin = pythonSelectionStatus?.selectedPluginId ?? null;
  const isSelectedForPython = selectedPythonPlugin === pluginId;
  const canUseForPython =
    !isSelectedForPython &&
    (pythonSelectionStatus?.availableProviders ?? []).some(
      (provider) => provider.available && provider.pluginId === pluginId,
    );
  return {
    isSelectedForPython,
    canUseForPython,
  };
}

function PluginSourceGuidanceNotices({
  pluginId,
  packageManagerManaged,
  packageManagerGuidance,
  linkedLocalSource,
}: {
  pluginId: string;
  packageManagerManaged: boolean;
  packageManagerGuidance: string;
  linkedLocalSource: boolean;
}) {
  return (
    <>
      {packageManagerManaged ? (
        <section
          data-testid={`plugin-package-manager-guidance-${pluginId}`}
          className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200"
        >
          <p className="font-semibold uppercase tracking-wide">
            Managed by package manager
          </p>
          <p className="mt-1">{packageManagerGuidance}</p>
        </section>
      ) : null}
      {linkedLocalSource ? (
        <section
          data-testid={`plugin-linked-source-guidance-${pluginId}`}
          className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <p className="font-semibold uppercase tracking-wide">
            Linked local plugin
          </p>
          <p className="mt-1">
            Update and rollback are unavailable for linked local sources. Unlink
            and link the desired local plugin directory instead.
          </p>
        </section>
      ) : null}
    </>
  );
}

function PluginConfigSection({
  plugin,
  isSettingsProject,
  disabled,
  runAction,
}: {
  plugin: PluginListEntry;
  isSettingsProject: boolean;
  disabled: boolean;
  runAction: PluginListEntryCardProps["runAction"];
}) {
  if (!plugin.config.hasSchema) {
    return null;
  }
  if (isSettingsProject) {
    return (
      <PluginConfigEditor
        plugin={plugin}
        disabled={disabled}
        runAction={runAction}
      />
    );
  }
  return (
    <section className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
      <p className="font-semibold uppercase tracking-wide">
        Plugin config available in /settings
      </p>
      <p className="mt-1">
        This plugin has schema-backed config. Open the Settings Project to edit
        it.
      </p>
    </section>
  );
}

function PluginCapabilitiesSection({
  requestedCapabilities,
  effectiveCapabilities,
  blockedCapabilities,
}: {
  requestedCapabilities: string[];
  effectiveCapabilities: string[];
  blockedCapabilities: PluginBlockedCapability[];
}) {
  if (
    requestedCapabilities.length === 0 &&
    effectiveCapabilities.length === 0 &&
    blockedCapabilities.length === 0
  ) {
    return null;
  }
  return (
    <section className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
      <h5 className="text-[11px] font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
        Capabilities
      </h5>
      <CapabilityRow
        label="Requested"
        entries={requestedCapabilities}
        emptyLabel="none"
        className="mt-1"
      />
      <CapabilityRow
        label="Effective"
        entries={effectiveCapabilities}
        emptyLabel="none"
        className="mt-1"
      />
      <CapabilityRow
        label="Blocked"
        entries={blockedCapabilities.map(
          (entry) => `${entry.capability} (${entry.reason})`,
        )}
        emptyLabel="none"
        className="mt-1"
        tone="blocked"
      />
    </section>
  );
}

function runPluginCommand(
  pluginId: string,
  command: PluginCommandSummary,
): void {
  void Promise.resolve(command.run()).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : `Command failed: ${command.id}`;
    addTemporaryNotification(message, "error");
  });
}

function PluginCommandsSection({
  pluginId,
  commands,
  unavailableMessage,
}: {
  pluginId: string;
  commands: readonly PluginCommandSummary[];
  unavailableMessage: string | null;
}) {
  if (commands.length > 0) {
    return (
      <section className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
        <h5 className="mb-1 text-[11px] font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
          Commands
        </h5>
        <div className="flex flex-wrap gap-1">
          {commands.map((command) => (
            <button
              key={`${pluginId}:${command.id}`}
              type="button"
              className="rounded border border-setta-300 px-2 py-1 text-[11px] text-setta-700 hover:bg-setta-50 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
              onClick={() => runPluginCommand(pluginId, command)}
            >
              {command.title}
            </button>
          ))}
        </div>
      </section>
    );
  }
  if (!unavailableMessage) {
    return null;
  }
  return (
    <section className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-semibold uppercase tracking-wide">
        Commands unavailable
      </p>
      <p className="mt-1">{unavailableMessage}</p>
    </section>
  );
}

function PluginFrontendErrorNotice({
  frontendError,
}: {
  frontendError: PluginListEntryCardRuntimeState["frontendError"];
}) {
  if (!frontendError) {
    return null;
  }
  return (
    <section className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
      <p className="font-semibold uppercase tracking-wide">
        Frontend load failed
      </p>
      <p className="mt-1 font-mono">{frontendError.code}</p>
      <p className="mt-1">{frontendError.message}</p>
    </section>
  );
}

function PluginPanesSection({
  pluginId,
  panes,
  disabled,
  unavailableMessage,
  onOpenPane,
}: {
  pluginId: string;
  panes: readonly PluginPaneSummary[];
  disabled: boolean;
  unavailableMessage: string | null;
  onOpenPane: (paneId: string) => void;
}) {
  if (panes.length > 0) {
    return (
      <section className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
        <h5 className="text-[11px] font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
          Plugin Panes
        </h5>
        <div className="mt-2 flex flex-wrap gap-1">
          {panes.map((pane) => (
            <button
              key={`${pluginId}:${pane.id}`}
              type="button"
              className="rounded border border-setta-300 px-2 py-1 text-[11px] text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
              onClick={() => onOpenPane(pane.id)}
              disabled={disabled}
            >
              Open {pane.title}
            </button>
          ))}
        </div>
      </section>
    );
  }
  if (!unavailableMessage) {
    return null;
  }
  return (
    <section className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-semibold uppercase tracking-wide">
        Plugin panes unavailable
      </p>
      <p className="mt-1">{unavailableMessage}</p>
    </section>
  );
}

function resolveCapabilityUnavailableMessage({
  capability,
  status,
  reason,
  serverMode,
}: {
  capability: "registerCommand" | "registerPane";
  status: ReturnType<
    typeof buildCapabilityStatusIndex
  >["capabilityStatusByCapability"] extends Map<string, infer TValue>
    ? TValue
    : never;
  reason: string | null;
  serverMode: PluginServerMode;
}): string | null {
  if (status === "not_requested") {
    return null;
  }
  return buildCapabilityUnavailableMessage({
    capability,
    status,
    reason,
    serverMode,
  });
}

function resolvePluginCapabilitySummary({
  requestedCapabilities,
  effectiveCapabilities,
  blockedCapabilities,
  serverMode,
}: {
  requestedCapabilities: string[];
  effectiveCapabilities: string[];
  blockedCapabilities: PluginBlockedCapability[];
  serverMode: PluginServerMode;
}) {
  const capabilityStatusIndex = buildCapabilityStatusIndex({
    requestedCapabilities,
    effectiveCapabilities,
    blockedCapabilities,
    capabilityList: ["registerCommand", "registerPane"],
  });
  const commandCapabilityStatus =
    capabilityStatusIndex.capabilityStatusByCapability.get("registerCommand") ??
    "not_requested";
  const paneCapabilityStatus =
    capabilityStatusIndex.capabilityStatusByCapability.get("registerPane") ??
    "not_requested";
  return {
    commandUnavailableMessage: resolveCapabilityUnavailableMessage({
      capability: "registerCommand",
      status: commandCapabilityStatus,
      reason:
        capabilityStatusIndex.blockedReasonByCapability.get(
          "registerCommand",
        ) ?? null,
      serverMode,
    }),
    paneUnavailableMessage: resolveCapabilityUnavailableMessage({
      capability: "registerPane",
      status: paneCapabilityStatus,
      reason:
        capabilityStatusIndex.blockedReasonByCapability.get("registerPane") ??
        null,
      serverMode,
    }),
  };
}

async function runUpdatePluginAction(
  plugin: PluginListEntry,
  runAction: PluginListEntryCardProps["runAction"],
) {
  await runAction(`update:${plugin.pluginId}`, "Update plugin", async () =>
    callOpenAPI(
      updatePlugin({
        body: {
          pluginId: plugin.pluginId,
          scope: plugin.sourceScope,
          to: null,
        },
      } as Parameters<typeof updatePlugin>[0]),
    ),
  );
}

async function runRollbackPluginAction(
  plugin: PluginListEntry,
  runAction: PluginListEntryCardProps["runAction"],
) {
  await runAction(`rollback:${plugin.pluginId}`, "Rollback plugin", async () =>
    callOpenAPI(
      rollbackPlugin({
        body: {
          pluginId: plugin.pluginId,
          scope: plugin.sourceScope,
        },
      } as Parameters<typeof rollbackPlugin>[0]),
    ),
  );
}

async function runUninstallPluginAction(
  plugin: PluginListEntry,
  runAction: PluginListEntryCardProps["runAction"],
) {
  await runAction(
    `uninstall:${plugin.pluginId}`,
    "Uninstall plugin",
    async () =>
      callOpenAPI(
        uninstallPlugin({
          body: {
            pluginId: plugin.pluginId,
            scope: plugin.sourceScope,
          },
        } as Parameters<typeof uninstallPlugin>[0]),
      ),
  );
}

type PluginListEntryCardViewProps = {
  plugin: PluginListEntry;
  pluginActionDisabled: boolean;
  packageManagerManaged: boolean;
  linkedLocalSource: boolean;
  packageManagerGuidance: string;
  isSettingsProject: boolean;
  runAction: PluginListEntryCardProps["runAction"];
  requestedCapabilities: string[];
  effectiveCapabilities: string[];
  blockedCapabilities: PluginBlockedCapability[];
  commands: readonly PluginCommandSummary[];
  commandUnavailableMessage: string | null;
  frontendError: PluginListEntryCardRuntimeState["frontendError"];
  panes: readonly PluginPaneSummary[];
  paneButtonsDisabled: boolean;
  paneUnavailableMessage: string | null;
  isSelectedForPython: boolean;
  canUseForPython: boolean;
  pluginToggleLabel: "Enable" | "Disable";
  onEnablePlugin: () => void;
  onDisablePlugin: () => void;
  onUseForPython: () => void;
  onUpdate: () => void;
  onRollback: () => void;
  onUninstall: () => void;
  onOpenPane: (paneId: string) => void;
};

function PluginListEntryCardHeader({
  plugin,
  isSelectedForPython,
}: Pick<PluginListEntryCardViewProps, "plugin" | "isSelectedForPython">) {
  return (
    <header className="mb-1 flex items-start justify-between gap-2">
      <div>
        <h4 className="font-mono text-xs font-semibold text-setta-900 dark:text-setta-100">
          {plugin.pluginId}@{plugin.version}
        </h4>
        <p className="text-[11px] text-setta-500 dark:text-setta-400">
          scope={plugin.sourceScopeLabel} source={plugin.canonicalSourceKey}
        </p>
      </div>
      <PluginListEntryCardBadges
        isSelectedForPython={isSelectedForPython}
        restartRequired={plugin.restartRequired}
      />
    </header>
  );
}

function PluginListEntryCardBadges({
  isSelectedForPython,
  restartRequired,
}: {
  isSelectedForPython: boolean;
  restartRequired: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {isSelectedForPython ? (
        <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
          Python selected
        </span>
      ) : null}
      {restartRequired ? (
        <span className="rounded bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
          restart required
        </span>
      ) : null}
    </div>
  );
}

function PluginListEntryCardActions({
  pluginId,
  pluginToggleLabel,
  pluginActionDisabled,
  packageManagerManaged,
  linkedLocalSource,
  canUseForPython,
  onEnablePlugin,
  onDisablePlugin,
  onUseForPython,
  onUpdate,
  onRollback,
  onUninstall,
}: {
  pluginId: string;
  pluginToggleLabel: "Enable" | "Disable";
  pluginActionDisabled: boolean;
  packageManagerManaged: boolean;
  linkedLocalSource: boolean;
  canUseForPython: boolean;
  onEnablePlugin: () => void;
  onDisablePlugin: () => void;
  onUseForPython: () => void;
  onUpdate: () => void;
  onRollback: () => void;
  onUninstall: () => void;
}) {
  const toggleAction =
    pluginToggleLabel === "Enable" ? onEnablePlugin : onDisablePlugin;
  const updateAndRollbackDisabled =
    pluginActionDisabled || packageManagerManaged || linkedLocalSource;
  const uninstallDisabled = pluginActionDisabled || packageManagerManaged;

  return (
    <div className="flex flex-wrap gap-1">
      <ActionButton
        label={pluginToggleLabel}
        onClick={toggleAction}
        disabled={pluginActionDisabled}
        testId={`plugin-card-toggle-${pluginId}`}
      />
      {canUseForPython ? (
        <ActionButton
          label="Use for Python"
          onClick={onUseForPython}
          disabled={pluginActionDisabled}
          testId={`plugin-card-use-python-${pluginId}`}
        />
      ) : null}
      <ActionButton
        label="Update"
        onClick={onUpdate}
        disabled={updateAndRollbackDisabled}
      />
      <ActionButton
        label="Rollback"
        onClick={onRollback}
        disabled={updateAndRollbackDisabled}
      />
      <ActionButton
        label="Uninstall"
        onClick={onUninstall}
        disabled={uninstallDisabled}
      />
    </div>
  );
}

function PluginListEntryCardView({
  plugin,
  pluginActionDisabled,
  packageManagerManaged,
  linkedLocalSource,
  packageManagerGuidance,
  isSettingsProject,
  runAction,
  requestedCapabilities,
  effectiveCapabilities,
  blockedCapabilities,
  commands,
  commandUnavailableMessage,
  frontendError,
  panes,
  paneButtonsDisabled,
  paneUnavailableMessage,
  isSelectedForPython,
  canUseForPython,
  pluginToggleLabel,
  onEnablePlugin,
  onDisablePlugin,
  onUseForPython,
  onUpdate,
  onRollback,
  onUninstall,
  onOpenPane,
}: PluginListEntryCardViewProps) {
  return (
    <article className="rounded border border-setta-200 bg-setta-50/60 p-2 dark:border-setta-800 dark:bg-setta-950/40">
      <PluginListEntryCardHeader
        plugin={plugin}
        isSelectedForPython={isSelectedForPython}
      />
      <PluginListEntryCardActions
        pluginId={plugin.pluginId}
        pluginToggleLabel={pluginToggleLabel}
        pluginActionDisabled={pluginActionDisabled}
        packageManagerManaged={packageManagerManaged}
        linkedLocalSource={linkedLocalSource}
        canUseForPython={canUseForPython}
        onEnablePlugin={onEnablePlugin}
        onDisablePlugin={onDisablePlugin}
        onUseForPython={onUseForPython}
        onUpdate={onUpdate}
        onRollback={onRollback}
        onUninstall={onUninstall}
      />
      <PluginSourceGuidanceNotices
        pluginId={plugin.pluginId}
        packageManagerManaged={packageManagerManaged}
        packageManagerGuidance={packageManagerGuidance}
        linkedLocalSource={linkedLocalSource}
      />
      <PluginConfigSection
        plugin={plugin}
        isSettingsProject={isSettingsProject}
        disabled={pluginActionDisabled}
        runAction={runAction}
      />
      <PluginCapabilitiesSection
        requestedCapabilities={requestedCapabilities}
        effectiveCapabilities={effectiveCapabilities}
        blockedCapabilities={blockedCapabilities}
      />
      <PluginCommandsSection
        pluginId={plugin.pluginId}
        commands={commands}
        unavailableMessage={commandUnavailableMessage}
      />
      <PluginFrontendErrorNotice frontendError={frontendError} />
      <PluginPanesSection
        pluginId={plugin.pluginId}
        panes={panes}
        disabled={paneButtonsDisabled}
        unavailableMessage={paneUnavailableMessage}
        onOpenPane={onOpenPane}
      />
    </article>
  );
}

function PluginListEntryCard({
  plugin,
  isSettingsProject,
  pythonSelectionStatus,
  writeActionsLocked,
  isAnyPluginActionBusy,
  runEnablePlugin,
  runDisablePlugin,
  selectPythonLanguageServer,
  runAction,
}: PluginListEntryCardProps) {
  const runtimeState = usePluginRuntimeStore(
    (state) => ({
      serverMode: state.serverMode ?? DEFAULT_PLUGIN_SERVER_MODE,
      pluginStatus: state.pluginStatusById[plugin.pluginId] ?? null,
      panes: state.panesByPluginId[plugin.pluginId] ?? EMPTY_PLUGIN_PANES,
      commands:
        state.commandsByPluginId[plugin.pluginId] ?? EMPTY_PLUGIN_COMMANDS,
      frontendError: state.frontendErrorsByPluginId[plugin.pluginId] ?? null,
    }),
    pluginListEntryCardRuntimeStateEqual,
  );
  const { serverMode, pluginStatus, panes, commands, frontendError } =
    runtimeState;
  const packageManagerManaged = plugin.sourceManager === "package_manager";
  const linkedLocalSource = isLinkedLocalPluginSource(plugin);
  const packageManagerGuidance = buildSourceManagerGuidanceMessage(plugin);
  const pluginActionBusy = isAnyPluginActionBusy(plugin.pluginId);
  const pluginActionDisabled = writeActionsLocked || pluginActionBusy;
  const paneButtonsDisabled = writeActionsLocked;
  const requestedCapabilities = pluginStatus?.requestedCapabilities ?? [];
  const effectiveCapabilities =
    pluginStatus?.effectiveCapabilities ?? plugin.effectiveCapabilities;
  const blockedCapabilities = pluginStatus?.blockedCapabilities ?? [];
  const pluginToggleLabel = buildPluginToggleLabel(pluginStatus);
  const { isSelectedForPython, canUseForPython } =
    buildPythonPluginSelectionState(plugin.pluginId, pythonSelectionStatus);
  const { commandUnavailableMessage, paneUnavailableMessage } = useMemo(
    () =>
      resolvePluginCapabilitySummary({
        requestedCapabilities,
        effectiveCapabilities,
        blockedCapabilities,
        serverMode,
      }),
    [
      blockedCapabilities,
      effectiveCapabilities,
      requestedCapabilities,
      serverMode,
    ],
  );
  return (
    <PluginListEntryCardView
      plugin={plugin}
      pluginActionDisabled={pluginActionDisabled}
      packageManagerManaged={packageManagerManaged}
      linkedLocalSource={linkedLocalSource}
      packageManagerGuidance={packageManagerGuidance}
      isSettingsProject={isSettingsProject}
      runAction={runAction}
      requestedCapabilities={requestedCapabilities}
      effectiveCapabilities={effectiveCapabilities}
      blockedCapabilities={blockedCapabilities}
      commands={commands}
      commandUnavailableMessage={commandUnavailableMessage}
      frontendError={frontendError}
      panes={panes}
      paneButtonsDisabled={paneButtonsDisabled}
      paneUnavailableMessage={paneUnavailableMessage}
      isSelectedForPython={isSelectedForPython}
      canUseForPython={canUseForPython}
      pluginToggleLabel={pluginToggleLabel}
      onEnablePlugin={() => {
        void runEnablePlugin(plugin.pluginId);
      }}
      onDisablePlugin={() => {
        void runDisablePlugin(plugin.pluginId);
      }}
      onUseForPython={() => {
        void selectPythonLanguageServer(plugin.pluginId);
      }}
      onUpdate={() => {
        void runUpdatePluginAction(plugin, runAction);
      }}
      onRollback={() => {
        void runRollbackPluginAction(plugin, runAction);
      }}
      onUninstall={() => {
        void runUninstallPluginAction(plugin, runAction);
      }}
      onOpenPane={(paneId) => {
        onOverviewTabClick(
          buildPluginPaneOverviewTabName(plugin.pluginId, paneId),
        );
      }}
    />
  );
}
function CapabilityRow({
  label,
  entries,
  emptyLabel,
  className = "",
  tone = "default",
}: {
  label: string;
  entries: string[];
  emptyLabel: string;
  className?: string;
  tone?: "default" | "blocked";
}) {
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.localeCompare(b)),
    [entries],
  );
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
function PluginConfigEditor({
  plugin,
  disabled,
  runAction,
}: {
  plugin: PluginListEntry;
  disabled: boolean;
  runAction: <T>(
    actionKey: string,
    actionLabel: string,
    operation: () => Promise<ResponseDataAndStatus<T>>,
  ) => Promise<ResponseDataAndStatus<T> | null>;
}) {
  const [draftRaw, setDraftRaw] = useState("{}");
  const [status, setStatus] = useState<SettingsEditorStatus | null>(null);
  const sourceIdentityToken = useMemo(
    () => buildPluginSourceIdentityToken(plugin),
    [plugin.canonicalSourceKey, plugin.sourceDigestSha256, plugin.sourceScope],
  );
  const schemaFields = useMemo(
    () => getTopLevelPluginConfigFields(plugin.config.schemaJson),
    [plugin.config.schemaJson],
  );
  const editableSchemaFields = useMemo(
    () =>
      schemaFields.filter((field) =>
        isSupportedTopLevelPluginConfigField(field.schema),
      ),
    [schemaFields],
  );
  const unsupportedSchemaFields = useMemo(
    () =>
      schemaFields
        .filter((field) => !isSupportedTopLevelPluginConfigField(field.schema))
        .map((field) => field.key),
    [schemaFields],
  );
  const parsedDraft = useMemo(
    () => parsePluginConfigDraft(draftRaw),
    [draftRaw],
  );
  const parsedConfig = parsedDraft.error ? {} : parsedDraft.value;
  useEffect(() => {
    setDraftRaw(formatPluginConfigDraft(plugin.config.currentConfig));
    setStatus(null);
  }, [plugin.config.currentConfig, plugin.pluginId, sourceIdentityToken]);
  function onFieldValueChange(fieldKey: string, nextValue: unknown) {
    if (parsedDraft.error) {
      return;
    }
    const nextConfig = setTopLevelPluginConfigValue(
      parsedDraft.value,
      fieldKey,
      nextValue,
    );
    setDraftRaw(formatPluginConfigDraft(nextConfig));
    setStatus(null);
  }
  async function onSavePluginConfig() {
    if (parsedDraft.error) {
      setStatus({ type: "error", message: parsedDraft.error });
      return;
    }
    const response = await runAction(
      `config:${plugin.pluginId}`,
      "Save plugin config",
      async () =>
        callOpenAPI(
          writePluginConfig({
            body: {
              pluginId: plugin.pluginId,
              config: parsedDraft.value,
            },
          } as Parameters<typeof writePluginConfig>[0]),
        ),
    );
    if (!response) {
      return;
    }
    setStatus({
      type: "success",
      message: "Plugin config saved.",
    });
  }
  return (
    <section className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
      <h5 className="text-[11px] font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
        Plugin Config
      </h5>
      {editableSchemaFields.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {editableSchemaFields.map((field) => (
            <PluginConfigTopLevelField
              key={`${plugin.pluginId}:${field.key}`}
              field={field}
              config={parsedConfig}
              disabled={disabled || parsedDraft.error !== null}
              onValueChange={onFieldValueChange}
            />
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
          No top-level primitive fields were detected from schema; use raw JSON.
        </p>
      )}
      {unsupportedSchemaFields.length > 0 ? (
        <p className="mt-2 text-[11px] text-setta-500 dark:text-setta-400">
          Complex fields (edit in raw JSON):{" "}
          {unsupportedSchemaFields.join(", ")}
        </p>
      ) : null}
      <div className="mt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Raw JSON
        </p>
        <textarea
          className="mt-1 h-28 w-full rounded border border-setta-300 bg-white p-2 font-mono text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
          value={draftRaw}
          onChange={(event) => {
            setDraftRaw(event.target.value);
            setStatus(null);
          }}
          spellCheck={false}
          disabled={disabled}
        />
      </div>
      {parsedDraft.error ? (
        <p className="mt-2 text-[11px] text-red-700 dark:text-red-300">
          {parsedDraft.error}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-setta-500 dark:text-setta-400">
          Config is stored in plugin state (`plugins_state.json`) for this
          workspace.
        </p>
        <button
          type="button"
          className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
          onClick={() => {
            void onSavePluginConfig();
          }}
          disabled={disabled}
        >
          Save Plugin Config
        </button>
      </div>
      {status ? (
        <p
          className={`mt-2 text-[11px] ${
            status.type === "error"
              ? "text-red-700 dark:text-red-300"
              : "text-green-700 dark:text-green-300"
          }`}
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
function PluginConfigTopLevelField({
  field,
  config,
  disabled,
  onValueChange,
}: {
  field: PluginConfigFieldDefinition;
  config: Record<string, unknown>;
  disabled: boolean;
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  const { value, displayLabelText, descriptionText } =
    resolvePluginConfigFieldPresentation(field, config);
  const input = buildPluginConfigFieldInput({
    field,
    value,
    disabled,
    onValueChange,
  });
  if (!input) {
    return null;
  }
  return (
    <div className="rounded border border-setta-200 bg-setta-50/70 p-2 dark:border-setta-850 dark:bg-setta-900/40">
      <p className="text-[11px] font-semibold text-setta-700 dark:text-setta-200">
        {displayLabelText}
      </p>
      <PluginConfigFieldDescription descriptionText={descriptionText} />
      {input}
    </div>
  );
}

function PluginConfigFieldDescription({
  descriptionText,
}: {
  descriptionText: string | null;
}) {
  if (!descriptionText) {
    return null;
  }
  return (
    <p className="mt-0.5 text-[10px] text-setta-500 dark:text-setta-400">
      {descriptionText}
    </p>
  );
}

function buildPluginConfigEnumInput({
  fieldKey,
  value,
  disabled,
  enumValues,
  onValueChange,
}: {
  fieldKey: string;
  value: unknown;
  disabled: boolean;
  enumValues: Array<string | number | boolean>;
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  const enumOptions = enumValues.map((enumValue) => ({
    raw: enumValue,
    serialized: JSON.stringify(enumValue),
  }));
  const selectedOption = enumOptions.find((option) => option.raw === value);
  const selectValue =
    value === undefined
      ? "__unset__"
      : selectedOption?.serialized ?? JSON.stringify(value);
  return (
    <select
      className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
      value={selectValue}
      onChange={(event) => {
        if (event.target.value === "__unset__") {
          onValueChange(fieldKey, undefined);
          return;
        }
        try {
          onValueChange(fieldKey, JSON.parse(event.target.value));
        } catch {
          onValueChange(fieldKey, undefined);
        }
      }}
      disabled={disabled}
    >
      <option value="__unset__">unset</option>
      {enumOptions.map((enumOption) => (
        <option key={enumOption.serialized} value={enumOption.serialized}>
          {String(enumOption.raw)}
        </option>
      ))}
    </select>
  );
}

function buildPluginConfigBooleanInput({
  fieldKey,
  value,
  disabled,
  onValueChange,
}: {
  fieldKey: string;
  value: unknown;
  disabled: boolean;
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  return (
    <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-setta-700 dark:text-setta-200">
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => {
          onValueChange(fieldKey, event.target.checked);
        }}
        disabled={disabled}
      />
      {value ? "Enabled" : "Disabled"}
    </label>
  );
}

function buildPluginConfigNumberInput({
  fieldKey,
  value,
  disabled,
  schemaType,
  onValueChange,
}: {
  fieldKey: string;
  value: unknown;
  disabled: boolean;
  schemaType: "integer" | "number";
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  const numberValue =
    typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  return (
    <input
      type="number"
      className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
      value={numberValue}
      onChange={(event) => {
        const rawValue = event.target.value;
        if (rawValue.trim() === "") {
          onValueChange(fieldKey, undefined);
          return;
        }
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed)) {
          return;
        }
        if (schemaType === "integer" && !Number.isInteger(parsed)) {
          return;
        }
        onValueChange(fieldKey, parsed);
      }}
      disabled={disabled}
    />
  );
}

function buildPluginConfigStringInput({
  field,
  value,
  disabled,
  onValueChange,
}: {
  field: PluginConfigFieldDefinition;
  value: unknown;
  disabled: boolean;
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  const uiHint = getSchemaUiHint(field.schema);
  const formatValue = field.schema.format;
  const format = typeof formatValue === "string" ? formatValue : "";
  const stringValue = typeof value === "string" ? value : "";
  const useTextArea =
    uiHint === "textarea" || uiHint === "json" || uiHint === "code";
  const inputType =
    uiHint === "password" || format === "password" ? "password" : "text";
  if (useTextArea) {
    return (
      <textarea
        className="mt-1 h-20 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
        value={stringValue}
        onChange={(event) => {
          onValueChange(field.key, event.target.value);
        }}
        spellCheck={false}
        disabled={disabled}
      />
    );
  }
  return (
    <input
      type={inputType}
      className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
      value={stringValue}
      onChange={(event) => {
        onValueChange(field.key, event.target.value);
      }}
      disabled={disabled}
    />
  );
}

function buildPluginConfigFieldInput({
  field,
  value,
  disabled,
  onValueChange,
}: {
  field: PluginConfigFieldDefinition;
  value: unknown;
  disabled: boolean;
  onValueChange: (fieldKey: string, nextValue: unknown) => void;
}) {
  const enumValues = getSchemaEnumValues(field.schema);
  if (enumValues) {
    return buildPluginConfigEnumInput({
      fieldKey: field.key,
      value,
      disabled,
      enumValues,
      onValueChange,
    });
  }
  const schemaType = resolveSchemaType(field.schema);
  if (schemaType === "boolean") {
    return buildPluginConfigBooleanInput({
      fieldKey: field.key,
      value,
      disabled,
      onValueChange,
    });
  }
  if (schemaType === "integer" || schemaType === "number") {
    return buildPluginConfigNumberInput({
      fieldKey: field.key,
      value,
      disabled,
      schemaType,
      onValueChange,
    });
  }
  if (schemaType === "string") {
    return buildPluginConfigStringInput({
      field,
      value,
      disabled,
      onValueChange,
    });
  }
  return null;
}

type SettingsEditorStatus = {
  type: "error" | "success";
  message: string;
};
function resolveSchemaType(schema: Record<string, unknown>): string | null {
  const rawType = schema.type;
  if (typeof rawType === "string") {
    return rawType;
  }
  if (!Array.isArray(rawType)) {
    return null;
  }
  for (const value of rawType) {
    if (typeof value === "string" && value !== "null") {
      return value;
    }
  }
  return null;
}
function getSchemaEnumValues(
  schema: Record<string, unknown>,
): Array<string | number | boolean> | null {
  const rawEnum = schema.enum;
  if (!Array.isArray(rawEnum) || rawEnum.length === 0) {
    return null;
  }
  const values: Array<string | number | boolean> = [];
  for (const enumValue of rawEnum) {
    if (
      typeof enumValue === "string" ||
      typeof enumValue === "number" ||
      typeof enumValue === "boolean"
    ) {
      values.push(enumValue);
    }
  }
  if (values.length === 0) {
    return null;
  }
  return values;
}
function getSchemaUiHint(schema: Record<string, unknown>): string | null {
  const rawUiHint = schema["x-setta-ui"];
  if (typeof rawUiHint !== "string") {
    return null;
  }
  const trimmed = rawUiHint.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed;
}
function isSupportedTopLevelPluginConfigField(
  schema: Record<string, unknown>,
): boolean {
  if (getSchemaEnumValues(schema)) {
    return true;
  }
  const schemaType = resolveSchemaType(schema);
  return (
    schemaType === "string" ||
    schemaType === "number" ||
    schemaType === "integer" ||
    schemaType === "boolean"
  );
}
function getTopLevelPluginConfigFields(
  schemaJson: Record<string, unknown> | null,
): PluginConfigFieldDefinition[] {
  if (!isPlainObject(schemaJson)) {
    return [];
  }
  const properties = schemaJson.properties;
  if (!isPlainObject(properties)) {
    return [];
  }
  const requiredRaw = schemaJson.required;
  const requiredFields = new Set<string>();
  if (Array.isArray(requiredRaw)) {
    for (const value of requiredRaw) {
      if (typeof value === "string") {
        requiredFields.add(value);
      }
    }
  }
  const fields: PluginConfigFieldDefinition[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (!isPlainObject(value)) {
      continue;
    }
    fields.push({
      key,
      required: requiredFields.has(key),
      schema: value,
    });
  }
  fields.sort((a, b) => a.key.localeCompare(b.key));
  return fields;
}
function setTopLevelPluginConfigValue(
  config: Record<string, unknown>,
  fieldKey: string,
  nextValue: unknown,
): Record<string, unknown> {
  const nextConfig = { ...config };
  if (nextValue === undefined) {
    delete nextConfig[fieldKey];
  } else {
    nextConfig[fieldKey] = nextValue;
  }
  return nextConfig;
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
function InstallSummaryCard({
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
function ActionButton({
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
function buildPluginActionError<T>(
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
function buildPluginActionThrownError(
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
function formatCapabilitiesForTableCached(capabilities: string[]): string {
  const cached = cachedFormattedCapabilitiesText.get(capabilities);
  if (cached) {
    return cached;
  }
  const formatted = formatCapabilitiesForTable(capabilities);
  cachedFormattedCapabilitiesText.set(capabilities, formatted);
  return formatted;
}
function formatCapabilitiesTooltip(capabilities: string[]): string {
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
function formatBlockedCapabilitiesForTableCached(
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
function formatBlockedCapabilitiesTooltip(
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
function getActionStatusClassName(type: PluginActionStatus["type"]): string {
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
