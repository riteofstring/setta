import {
  buildPluginRestartActionPlan,
  getRestartRequiredPluginIds,
} from "plugins/restart";
import {
  refreshPluginRuntime,
  usePluginListEntries,
  usePluginRuntimeStore,
  usePluginStatusEntries,
} from "plugins/runtime";
import { useEffect, useMemo, useState } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import { C } from "utils/c";
import { buildPluginPaneOverviewTabName } from "utils/constants";
import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import {
  route_plugins_config,
  route_plugins_disable,
  route_plugins_enable,
  route_plugins_install,
  route_plugins_rescan,
  route_plugins_restart,
  route_plugins_rollback,
  route_plugins_uninstall,
  route_plugins_update,
  route_save_settings,
} from "utils/generatedEndpoints";
import type {
  PluginBlockedCapability,
  PluginInstallRequestInput,
  PluginInstallResponse,
  PluginListEntry,
  PluginRestartCapability,
  PluginRollbackRequestInput,
  PluginStatusEntry,
  PluginUninstallRequestInput,
  PluginUpdateRequestInput,
  SettingsState,
} from "utils/generatedTypes";
import { onOverviewTabClick } from "../../paneFns";

type InstallScope = "workspace" | "setta_files" | "global";
type InstallBackend = "auto" | "pip" | "uv";

type PluginActionStatus = {
  type: "error" | "success" | "warning";
  message: string;
};

type PluginInstallSummary = PluginInstallResponse;

type PluginRegisteredLanguageServer =
  PluginStatusEntry["registeredLanguageServers"][number];
type PluginRegisteredExternalAgentAdapter =
  PluginStatusEntry["registeredExternalAgentAdapters"][number];
type PluginRegisteredCodegenTarget =
  PluginStatusEntry["registeredCodegenTargets"][number];

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
  serverMode: "ide" | "share" | "app";
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
  statusMessage: string;
  restartCapability: PluginRestartCapability | null;
  serverMode: "ide" | "share" | "app";
  loadGeneration: number;
};

const EMPTY_PLUGIN_PANES: readonly PluginPaneSummary[] = [];
const EMPTY_PLUGIN_COMMANDS: readonly PluginCommandSummary[] = [];
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
    a.serverMode === b.serverMode &&
    a.loadGeneration === b.loadGeneration
  );
}

export function PluginsPane() {
  const [sourceSpec, setSourceSpec] = useState("");
  const [scope, setScope] = useState<InstallScope>("workspace");
  const [installer, setInstaller] = useState<InstallBackend>("auto");
  const [enableAfterInstall, setEnableAfterInstall] = useState(true);
  const [busyActionKeys, setBusyActionKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [actionStatus, setActionStatus] = useState<PluginActionStatus | null>(
    null,
  );
  const [installSummary, setInstallSummary] =
    useState<PluginInstallSummary | null>(null);

  const pluginListEntries = usePluginListEntries();
  const pluginStatusEntries = usePluginStatusEntries();
  const runtimeSummary = usePluginRuntimeStore(
    (state) => ({
      status: state.status,
      statusMessage: state.statusMessage,
      restartCapability: state.restartCapability,
      serverMode: state.serverMode,
      loadGeneration: state.loadGeneration,
    }),
    pluginsPaneRuntimeSummaryEqual,
  );
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const currentProjectConfigName = useProjectState(
    (state) => state.projectConfig.name,
  );
  const writeActionsLocked =
    runtimeSummary.serverMode !== "ide" || isDeploymentMode;
  const isSettingsProject =
    currentProjectConfigName.trim().toLowerCase() ===
    C.SETTINGS_PROJECT_NAME.toLowerCase();

  const sortedStatusEntries = useMemo(
    () =>
      [...pluginStatusEntries].sort((a, b) => {
        const byPluginId = a.pluginId.localeCompare(b.pluginId);
        if (byPluginId !== 0) {
          return byPluginId;
        }
        return a.sourcePath.localeCompare(b.sourcePath);
      }),
    [pluginStatusEntries],
  );
  const restartRequiredPluginIds = useMemo(
    () => getRestartRequiredPluginIds(pluginListEntries, pluginStatusEntries),
    [pluginListEntries, pluginStatusEntries],
  );
  const restartActionPlan = useMemo(
    () => buildPluginRestartActionPlan(runtimeSummary.restartCapability),
    [runtimeSummary.restartCapability],
  );

  async function runAction<T>(
    actionKey: string,
    actionLabel: string,
    operation: () => Promise<ResponseDataAndStatus<T>>,
  ): Promise<ResponseDataAndStatus<T> | null> {
    setBusyActionKeys((previous) => {
      if (previous.has(actionKey)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(actionKey);
      return next;
    });
    setActionStatus(null);
    try {
      const response = await operation();
      if (!res200(response)) {
        const message = buildPluginActionError(actionLabel, response);
        setActionStatus({ type: "error", message });
        addTemporaryNotification(message, "error");
        return null;
      }
      setActionStatus({
        type: "success",
        message: `${actionLabel} completed.`,
      });
      await refreshPluginRuntime();
      return response;
    } finally {
      setBusyActionKeys((previous) => {
        if (!previous.has(actionKey)) {
          return previous;
        }
        const next = new Set(previous);
        next.delete(actionKey);
        return next;
      });
    }
  }

  function isActionBusy(actionKey: string): boolean {
    return busyActionKeys.has(actionKey);
  }

  function isAnyPluginActionBusy(pluginId: string): boolean {
    for (const actionKey of busyActionKeys) {
      if (actionKey.endsWith(`:${pluginId}`)) {
        return true;
      }
    }
    return false;
  }

  async function onInstallPlugin() {
    const sourceErrorMessage = validateInstallSourceSpec(sourceSpec);
    if (sourceErrorMessage) {
      setActionStatus({ type: "error", message: sourceErrorMessage });
      return;
    }
    setInstallSummary(null);
    const trimmedSourceSpec = sourceSpec.trim();
    const response = await runAction("install", "Install plugin", async () =>
      route_plugins_install({
        sourceSpec: trimmedSourceSpec,
        scope,
        installer,
        enable: enableAfterInstall,
        force: false,
      } as PluginInstallRequestInput),
    );
    if (!response || !response.data) {
      return;
    }
    setInstallSummary(response.data);
    setSourceSpec("");
  }

  async function onRescan() {
    await runAction("rescan", "Rescan plugins", async () =>
      route_plugins_rescan(),
    );
  }

  async function onRestart() {
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
    const response = await runAction(
      "restart",
      "Restart plugins runtime",
      async () => route_plugins_restart(),
    );
    if (!response || !response.data) {
      return;
    }
    if (response.data.accepted) {
      setActionStatus({
        type: "success",
        message: "Restart request accepted.",
      });
      addTemporaryNotification("Restart request accepted.", "info");
      return;
    }
    const command = response.data.command ?? "setta";
    const reason = response.data.reason?.trim() ? response.data.reason : null;
    const message = reason
      ? `Manual restart required: ${command}. ${reason}`
      : `Manual restart required: ${command}`;
    setActionStatus({
      type: "warning",
      message,
    });
    addTemporaryNotification(`Manual restart required: ${command}`, "warning");
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2 overflow-y-auto pb-2">
      <section className="rounded-md border border-setta-200 bg-white p-2 dark:border-setta-850 dark:bg-setta-900">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
            Plugin Runtime
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
              onClick={onRescan}
              disabled={isActionBusy("rescan")}
            >
              Rescan
            </button>
            <button
              type="button"
              className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
              onClick={onRestart}
              disabled={
                isActionBusy("restart") ||
                restartActionPlan.mode === "unavailable"
              }
            >
              Restart Setta
            </button>
          </div>
        </header>
        <p className="text-[11px] text-setta-600 dark:text-setta-300">
          mode={runtimeSummary.serverMode ?? "unknown"} status=
          {runtimeSummary.status} generation=
          {runtimeSummary.loadGeneration}
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

      {restartRequiredPluginIds.length > 0 ? (
        <section className="rounded-md border border-yellow-300 bg-yellow-50 p-2 text-[11px] text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-950/40 dark:text-yellow-200">
          <p className="font-semibold uppercase tracking-wide">
            Restart required
          </p>
          <p className="mt-1">
            Backend changes are pending for:{" "}
            {restartRequiredPluginIds.join(", ")}
          </p>
          {restartActionPlan.mode === "manual" ? (
            <p className="mt-1">
              Manual command: <code>{restartActionPlan.command}</code>
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-md border border-setta-200 bg-white p-2 dark:border-setta-850 dark:bg-setta-900">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
          Install Plugin
        </h3>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={sourceSpec}
            onChange={(event) => setSourceSpec(event.target.value)}
            placeholder="github:owner/repo[#ref] or pypi:package[==version]"
            className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
            disabled={writeActionsLocked || isActionBusy("install")}
          />
          <div className="flex items-center gap-2">
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as InstallScope)}
              data-testid="plugin-install-scope"
              className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
              disabled={writeActionsLocked || isActionBusy("install")}
            >
              <option value="workspace">workspace</option>
              <option value="setta_files">setta_files</option>
              <option value="global">global</option>
            </select>
            <select
              value={installer}
              onChange={(event) =>
                setInstaller(event.target.value as InstallBackend)
              }
              data-testid="plugin-install-installer"
              className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
              disabled={writeActionsLocked || isActionBusy("install")}
            >
              <option value="auto">auto</option>
              <option value="pip">pip</option>
              <option value="uv">uv</option>
            </select>
            <label className="flex items-center gap-1 text-[11px] text-setta-600 dark:text-setta-300">
              <input
                type="checkbox"
                checked={enableAfterInstall}
                onChange={(event) =>
                  setEnableAfterInstall(event.target.checked)
                }
                disabled={writeActionsLocked || isActionBusy("install")}
              />
              enable after install
            </label>
            <button
              type="button"
              className="ml-auto rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
              onClick={onInstallPlugin}
              disabled={writeActionsLocked || isActionBusy("install")}
            >
              Install
            </button>
          </div>
          {writeActionsLocked ? (
            <p className="text-[11px] text-setta-500 dark:text-setta-400">
              Plugin install/uninstall/update actions are IDE-mode only.
            </p>
          ) : (
            <p className="text-[11px] text-setta-500 dark:text-setta-400">
              Supported sources: <code>github:</code> and <code>pypi:</code>.
              Installer <code>auto</code> prefers <code>uv</code> when
              available, otherwise <code>pip</code>.
            </p>
          )}
        </div>
      </section>

      {actionStatus ? (
        <section
          className={`rounded-md border p-2 text-[11px] ${getActionStatusClassName(actionStatus.type)}`}
        >
          {actionStatus.message}
        </section>
      ) : null}

      {installSummary ? (
        <InstallSummaryCard installSummary={installSummary} />
      ) : null}

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
                key={`${plugin.pluginId}:${plugin.sourceScope}:${plugin.version}`}
                plugin={plugin}
                isSettingsProject={isSettingsProject}
                writeActionsLocked={writeActionsLocked}
                isActionBusy={isActionBusy}
                isAnyPluginActionBusy={isAnyPluginActionBusy}
                runAction={runAction}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-md border border-setta-200 bg-white p-2 dark:border-setta-850 dark:bg-setta-900">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
          Discovery Status ({sortedStatusEntries.length})
        </h3>
        <div className="max-h-64 overflow-auto rounded border border-setta-200 dark:border-setta-800">
          {sortedStatusEntries.length === 0 ? (
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
                </tr>
              </thead>
              <tbody>
                {sortedStatusEntries.map((entry) => (
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
                      <span title={entry.requestedCapabilities.join(", ")}>
                        {formatCapabilitiesForTable(
                          entry.requestedCapabilities,
                        )}
                      </span>
                    </td>
                    <td className="max-w-[150px] px-2 py-1 text-setta-600 dark:text-setta-300">
                      <span title={entry.effectiveCapabilities.join(", ")}>
                        {formatCapabilitiesForTable(
                          entry.effectiveCapabilities,
                        )}
                      </span>
                    </td>
                    <td className="max-w-[170px] px-2 py-1 text-setta-600 dark:text-setta-300">
                      <span
                        title={entry.blockedCapabilities
                          .map(
                            (blockedCapability) =>
                              `${blockedCapability.capability} (${blockedCapability.reason})`,
                          )
                          .join(", ")}
                      >
                        {formatBlockedCapabilitiesForTable(
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

type PluginListEntryCardProps = {
  plugin: PluginListEntry;
  isSettingsProject: boolean;
  writeActionsLocked: boolean;
  isActionBusy: (actionKey: string) => boolean;
  isAnyPluginActionBusy: (pluginId: string) => boolean;
  runAction: <T>(
    actionKey: string,
    actionLabel: string,
    operation: () => Promise<ResponseDataAndStatus<T>>,
  ) => Promise<ResponseDataAndStatus<T> | null>;
};

function PluginListEntryCard({
  plugin,
  isSettingsProject,
  writeActionsLocked,
  isActionBusy,
  isAnyPluginActionBusy,
  runAction,
}: PluginListEntryCardProps) {
  const runtimeState = usePluginRuntimeStore(
    (state) => ({
      serverMode: state.serverMode ?? "ide",
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

  async function onEnable() {
    await runAction(`enable:${plugin.pluginId}`, "Enable plugin", async () =>
      route_plugins_enable({ pluginId: plugin.pluginId }),
    );
  }

  async function onDisable() {
    await runAction(`disable:${plugin.pluginId}`, "Disable plugin", async () =>
      route_plugins_disable({ pluginId: plugin.pluginId }),
    );
  }

  async function onUpdate() {
    await runAction(`update:${plugin.pluginId}`, "Update plugin", async () =>
      route_plugins_update({
        pluginId: plugin.pluginId,
        scope: plugin.sourceScope,
        to: null,
      } as PluginUpdateRequestInput),
    );
  }

  async function onRollback() {
    await runAction(
      `rollback:${plugin.pluginId}`,
      "Rollback plugin",
      async () =>
        route_plugins_rollback({
          pluginId: plugin.pluginId,
          scope: plugin.sourceScope,
        } as PluginRollbackRequestInput),
    );
  }

  async function onUninstall() {
    await runAction(
      `uninstall:${plugin.pluginId}`,
      "Uninstall plugin",
      async () =>
        route_plugins_uninstall({
          pluginId: plugin.pluginId,
          scope: plugin.sourceScope,
        } as PluginUninstallRequestInput),
    );
  }

  const packageManagerManaged = plugin.sourceManager === "package_manager";
  const packageManagerGuidance = buildSourceManagerGuidanceMessage(plugin);
  const pluginActionBusy = isAnyPluginActionBusy(plugin.pluginId);
  const pluginActionDisabled = writeActionsLocked || pluginActionBusy;
  const paneButtonsDisabled = writeActionsLocked;
  const requestedCapabilities = pluginStatus?.requestedCapabilities ?? [];
  const effectiveCapabilities =
    pluginStatus?.effectiveCapabilities ?? plugin.effectiveCapabilities;
  const blockedCapabilities = pluginStatus?.blockedCapabilities ?? [];
  const registeredLanguageServers = getRegisteredLanguageServers(pluginStatus);
  const registeredExternalAgentAdapters =
    getRegisteredExternalAgentAdapters(pluginStatus);
  const registeredCodegenTargets = getRegisteredCodegenTargets(pluginStatus);
  const commandCapabilityStatus = getPluginCapabilityStatus(
    pluginStatus,
    plugin,
    "registerCommand",
  );
  const paneCapabilityStatus = getPluginCapabilityStatus(
    pluginStatus,
    plugin,
    "registerPane",
  );
  const commandCapabilityReason = getBlockedCapabilityReason(
    blockedCapabilities,
    "registerCommand",
  );
  const paneCapabilityReason = getBlockedCapabilityReason(
    blockedCapabilities,
    "registerPane",
  );
  const languageServerCapabilityStatus = getPluginCapabilityStatus(
    pluginStatus,
    plugin,
    "registerLanguageServer",
  );
  const languageServerCapabilityReason = getBlockedCapabilityReason(
    blockedCapabilities,
    "registerLanguageServer",
  );
  const externalAgentCapabilityStatus = getPluginCapabilityStatus(
    pluginStatus,
    plugin,
    "registerExternalAgentAdapter",
  );
  const externalAgentCapabilityReason = getBlockedCapabilityReason(
    blockedCapabilities,
    "registerExternalAgentAdapter",
  );
  const codegenCapabilityStatus = getPluginCapabilityStatus(
    pluginStatus,
    plugin,
    "registerCodegenTarget",
  );
  const codegenCapabilityReason = getBlockedCapabilityReason(
    blockedCapabilities,
    "registerCodegenTarget",
  );

  function onOpenPane(paneId: string) {
    onOverviewTabClick(buildPluginPaneOverviewTabName(plugin.pluginId, paneId));
  }

  return (
    <article className="rounded border border-setta-200 bg-setta-50/60 p-2 dark:border-setta-800 dark:bg-setta-950/40">
      <header className="mb-1 flex items-start justify-between gap-2">
        <div>
          <h4 className="font-mono text-xs font-semibold text-setta-900 dark:text-setta-100">
            {plugin.pluginId}@{plugin.version}
          </h4>
          <p className="text-[11px] text-setta-500 dark:text-setta-400">
            scope={plugin.sourceScopeLabel} source={plugin.canonicalSourceKey}
          </p>
        </div>
        {plugin.restartRequired ? (
          <span className="rounded bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
            restart required
          </span>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-1">
        <ActionButton
          label="Enable"
          onClick={onEnable}
          disabled={
            writeActionsLocked || isActionBusy(`enable:${plugin.pluginId}`)
          }
        />
        <ActionButton
          label="Disable"
          onClick={onDisable}
          disabled={
            writeActionsLocked || isActionBusy(`disable:${plugin.pluginId}`)
          }
        />
        <ActionButton
          label="Update"
          onClick={onUpdate}
          disabled={
            writeActionsLocked ||
            packageManagerManaged ||
            isActionBusy(`update:${plugin.pluginId}`)
          }
        />
        <ActionButton
          label="Rollback"
          onClick={onRollback}
          disabled={
            writeActionsLocked ||
            packageManagerManaged ||
            isActionBusy(`rollback:${plugin.pluginId}`)
          }
        />
        <ActionButton
          label="Uninstall"
          onClick={onUninstall}
          disabled={
            writeActionsLocked ||
            packageManagerManaged ||
            isActionBusy(`uninstall:${plugin.pluginId}`)
          }
        />
      </div>

      {packageManagerManaged ? (
        <section
          data-testid={`plugin-package-manager-guidance-${plugin.pluginId}`}
          className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200"
        >
          <p className="font-semibold uppercase tracking-wide">
            Managed by package manager
          </p>
          <p className="mt-1">{packageManagerGuidance}</p>
        </section>
      ) : null}

      {plugin.config.hasSchema ? (
        isSettingsProject ? (
          <PluginConfigEditor
            plugin={plugin}
            disabled={pluginActionDisabled}
            runAction={runAction}
          />
        ) : (
          <section className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
            <p className="font-semibold uppercase tracking-wide">
              Plugin config available in /settings
            </p>
            <p className="mt-1">
              This plugin has schema-backed config. Open the Settings Project to
              edit it.
            </p>
          </section>
        )
      ) : null}

      {(requestedCapabilities.length > 0 ||
        effectiveCapabilities.length > 0 ||
        blockedCapabilities.length > 0) && (
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
      )}

      {registeredLanguageServers.length > 0 ? (
        <section className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
          <h5 className="text-[11px] font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
            Registered Language Servers
          </h5>
          <div className="mt-2 flex flex-col gap-2">
            {registeredLanguageServers.map((registration) => (
              <article
                key={`${plugin.pluginId}:${registration.name}`}
                className="rounded border border-setta-200 bg-setta-50/70 p-2 dark:border-setta-850 dark:bg-setta-900/40"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-setta-700 dark:text-setta-200">
                  <span className="font-semibold">{registration.language}</span>
                  <span className="font-mono">{registration.command}</span>
                  {registration.args.length > 0 ? (
                    <span className="font-mono">
                      {registration.args.join(" ")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[10px] text-setta-500 dark:text-setta-400">
                  name={registration.name}
                  {registration.settingsKey
                    ? ` settingsKey=${registration.settingsKey}`
                    : ""}
                </p>
                {registration.settingsKey ? (
                  <LanguageServerSettingsEditor
                    settingsKey={registration.settingsKey}
                    disabled={writeActionsLocked}
                  />
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : languageServerCapabilityStatus === "effective" ? (
        <section className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
          <p className="font-semibold uppercase tracking-wide">
            Language servers pending runtime load
          </p>
          <p className="mt-1">
            No language server registrations are active yet. Restart Setta if
            this plugin was just installed or updated.
          </p>
        </section>
      ) : languageServerCapabilityStatus !== "not_requested" ? (
        <section className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold uppercase tracking-wide">
            Language servers unavailable
          </p>
          <p className="mt-1">
            {buildCapabilityUnavailableMessage({
              capability: "registerLanguageServer",
              status: languageServerCapabilityStatus,
              reason: languageServerCapabilityReason,
              serverMode,
            })}
          </p>
        </section>
      ) : null}

      {registeredExternalAgentAdapters.length > 0 ? (
        <section className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
          <h5 className="text-[11px] font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
            Registered External Agent Adapters
          </h5>
          <div className="mt-2 flex flex-col gap-2">
            {registeredExternalAgentAdapters.map((registration) => (
              <article
                key={registration.adapterId}
                className="rounded border border-setta-200 bg-setta-50/70 p-2 dark:border-setta-850 dark:bg-setta-900/40"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-setta-700 dark:text-setta-200">
                  <span className="font-semibold">{registration.name}</span>
                  <span className="font-mono">{registration.adapterId}</span>
                </div>
                <p className="mt-1 text-[10px] text-setta-500 dark:text-setta-400">
                  runModes=
                  {registration.runModes.length > 0
                    ? registration.runModes.join(", ")
                    : "none"}{" "}
                  command={registration.command}
                  {registration.args.length > 0
                    ? ` ${registration.args.join(" ")}`
                    : ""}
                </p>
                {(registration.defaultModel ||
                  registration.envVarWhitelist.length > 0) && (
                  <p className="mt-1 text-[10px] text-setta-500 dark:text-setta-400">
                    {registration.defaultModel
                      ? `defaultModel=${registration.defaultModel}`
                      : ""}
                    {registration.defaultModel &&
                    registration.envVarWhitelist.length > 0
                      ? " "
                      : ""}
                    {registration.envVarWhitelist.length > 0
                      ? `envVarWhitelist=${registration.envVarWhitelist.join(", ")}`
                      : ""}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : externalAgentCapabilityStatus === "effective" ? (
        <section className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
          <p className="font-semibold uppercase tracking-wide">
            External agent adapters pending runtime load
          </p>
          <p className="mt-1">
            No plugin external agent registrations are active yet. Restart Setta
            if this plugin was just installed or updated.
          </p>
        </section>
      ) : externalAgentCapabilityStatus !== "not_requested" ? (
        <section className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold uppercase tracking-wide">
            External agent adapters unavailable
          </p>
          <p className="mt-1">
            {buildCapabilityUnavailableMessage({
              capability: "registerExternalAgentAdapter",
              status: externalAgentCapabilityStatus,
              reason: externalAgentCapabilityReason,
              serverMode,
            })}
          </p>
        </section>
      ) : null}

      {registeredCodegenTargets.length > 0 ? (
        <section className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
          <h5 className="text-[11px] font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
            Registered Codegen Targets
          </h5>
          <div className="mt-2 flex flex-col gap-2">
            {registeredCodegenTargets.map((registration) => (
              <article
                key={registration.targetId}
                className="rounded border border-setta-200 bg-setta-50/70 p-2 dark:border-setta-850 dark:bg-setta-900/40"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-setta-700 dark:text-setta-200">
                  <span className="font-semibold">{registration.name}</span>
                  <span className="font-mono">{registration.language}</span>
                  <span className="font-mono">{registration.targetId}</span>
                </div>
                <p className="mt-1 text-[10px] text-setta-500 dark:text-setta-400">
                  defaultFileName={registration.defaultFileName}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : codegenCapabilityStatus === "effective" ? (
        <section className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
          <p className="font-semibold uppercase tracking-wide">
            Codegen targets pending runtime load
          </p>
          <p className="mt-1">
            No plugin codegen target registrations are active yet. Restart Setta
            if this plugin was just installed or updated.
          </p>
        </section>
      ) : codegenCapabilityStatus !== "not_requested" ? (
        <section className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold uppercase tracking-wide">
            Codegen targets unavailable
          </p>
          <p className="mt-1">
            {buildCapabilityUnavailableMessage({
              capability: "registerCodegenTarget",
              status: codegenCapabilityStatus,
              reason: codegenCapabilityReason,
              serverMode,
            })}
          </p>
        </section>
      ) : null}

      {commands.length > 0 ? (
        <section className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
          <h5 className="mb-1 text-[11px] font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
            Commands
          </h5>
          <div className="flex flex-wrap gap-1">
            {commands.map((command) => (
              <button
                key={`${plugin.pluginId}:${command.id}`}
                type="button"
                className="rounded border border-setta-300 px-2 py-1 text-[11px] text-setta-700 hover:bg-setta-50 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
                onClick={() => {
                  void Promise.resolve(command.run()).catch(
                    (error: unknown) => {
                      const message =
                        error instanceof Error
                          ? error.message
                          : `Command failed: ${command.id}`;
                      addTemporaryNotification(message, "error");
                    },
                  );
                }}
              >
                {command.title}
              </button>
            ))}
          </div>
        </section>
      ) : commandCapabilityStatus !== "not_requested" ? (
        <section className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold uppercase tracking-wide">
            Commands unavailable
          </p>
          <p className="mt-1">
            {buildCapabilityUnavailableMessage({
              capability: "registerCommand",
              status: commandCapabilityStatus,
              reason: commandCapabilityReason,
              serverMode,
            })}
          </p>
        </section>
      ) : null}

      {frontendError ? (
        <section className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold uppercase tracking-wide">
            Frontend load failed
          </p>
          <p className="mt-1 font-mono">{frontendError.code}</p>
          <p className="mt-1">{frontendError.message}</p>
        </section>
      ) : null}

      {panes.length > 0 ? (
        <section className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
          <h5 className="text-[11px] font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
            Plugin Panes
          </h5>
          <div className="mt-2 flex flex-wrap gap-1">
            {panes.map((pane) => (
              <button
                key={`${plugin.pluginId}:${pane.id}`}
                type="button"
                className="rounded border border-setta-300 px-2 py-1 text-[11px] text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
                onClick={() => onOpenPane(pane.id)}
                disabled={paneButtonsDisabled}
              >
                Open {pane.title}
              </button>
            ))}
          </div>
        </section>
      ) : paneCapabilityStatus !== "not_requested" ? (
        <section className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold uppercase tracking-wide">
            Plugin panes unavailable
          </p>
          <p className="mt-1">
            {buildCapabilityUnavailableMessage({
              capability: "registerPane",
              status: paneCapabilityStatus,
              reason: paneCapabilityReason,
              serverMode,
            })}
          </p>
        </section>
      ) : null}
    </article>
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

type PluginConfigFieldDefinition = {
  key: string;
  required: boolean;
  schema: Record<string, unknown>;
};

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
  }, [plugin.config.currentConfig, plugin.pluginId]);

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
        route_plugins_config({
          pluginId: plugin.pluginId,
          config: parsedDraft.value,
        }),
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
  const schemaType = resolveSchemaType(field.schema);
  const enumValues = getSchemaEnumValues(field.schema);
  const schemaDefault = field.schema.default;
  let value = config[field.key];
  if (value === undefined && schemaDefault !== undefined) {
    value = schemaDefault;
  }
  const label = field.schema.title;
  const labelText =
    typeof label === "string" && label.trim() ? label.trim() : field.key;
  const description = field.schema.description;
  const descriptionText =
    typeof description === "string" && description.trim()
      ? description.trim()
      : null;
  let input = null;
  if (enumValues) {
    const selectValue =
      value === undefined ? "__unset__" : JSON.stringify(value);
    input = (
      <select
        className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
        value={selectValue}
        onChange={(event) => {
          if (event.target.value === "__unset__") {
            onValueChange(field.key, undefined);
            return;
          }
          try {
            onValueChange(field.key, JSON.parse(event.target.value));
          } catch {
            onValueChange(field.key, undefined);
          }
        }}
        disabled={disabled}
      >
        <option value="__unset__">unset</option>
        {enumValues.map((enumValue) => (
          <option
            key={JSON.stringify(enumValue)}
            value={JSON.stringify(enumValue)}
          >
            {String(enumValue)}
          </option>
        ))}
      </select>
    );
  } else if (schemaType === "boolean") {
    input = (
      <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-setta-700 dark:text-setta-200">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => {
            onValueChange(field.key, event.target.checked);
          }}
          disabled={disabled}
        />
        {Boolean(value) ? "Enabled" : "Disabled"}
      </label>
    );
  } else if (schemaType === "integer" || schemaType === "number") {
    const numberValue =
      typeof value === "number" && Number.isFinite(value) ? String(value) : "";
    input = (
      <input
        type="number"
        className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
        value={numberValue}
        onChange={(event) => {
          const rawValue = event.target.value;
          if (rawValue.trim() === "") {
            onValueChange(field.key, undefined);
            return;
          }
          const parsed = Number(rawValue);
          if (!Number.isFinite(parsed)) {
            return;
          }
          if (schemaType === "integer" && !Number.isInteger(parsed)) {
            return;
          }
          onValueChange(field.key, parsed);
        }}
        disabled={disabled}
      />
    );
  } else if (schemaType === "string") {
    const uiHint = getSchemaUiHint(field.schema);
    const formatValue = field.schema.format;
    const format = typeof formatValue === "string" ? formatValue : "";
    const stringValue = typeof value === "string" ? value : "";
    const useTextArea =
      uiHint === "textarea" || uiHint === "json" || uiHint === "code";
    const inputType =
      uiHint === "password" || format === "password" ? "password" : "text";
    if (useTextArea) {
      input = (
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
    } else {
      input = (
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
  }
  if (!input) {
    return null;
  }

  return (
    <div className="rounded border border-setta-200 bg-setta-50/70 p-2 dark:border-setta-850 dark:bg-setta-900/40">
      <p className="text-[11px] font-semibold text-setta-700 dark:text-setta-200">
        {labelText}
        {field.required ? " *" : ""}
      </p>
      {descriptionText ? (
        <p className="mt-0.5 text-[10px] text-setta-500 dark:text-setta-400">
          {descriptionText}
        </p>
      ) : null}
      {input}
    </div>
  );
}

type SettingsEditorStatus = {
  type: "error" | "success";
  message: string;
};

function LanguageServerSettingsEditor({
  settingsKey,
  disabled,
}: {
  settingsKey: string;
  disabled: boolean;
}) {
  const languageServerSettings = useSettings(
    (state) => state.languageServer as Record<string, unknown>,
  );
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<SettingsEditorStatus | null>(null);

  useEffect(() => {
    const settingsValue = getLanguageServerSettingsValue(
      languageServerSettings,
      settingsKey,
    );
    setDraft(formatLanguageServerSettingsDraft(settingsValue));
    setStatus(null);
  }, [languageServerSettings, settingsKey]);

  async function onSaveSettings() {
    const parsedSettings = parseLanguageServerSettingsDraft(draft);
    if (parsedSettings.error) {
      setStatus({ type: "error", message: parsedSettings.error });
      return;
    }
    const nextLanguageServerSettings = setLanguageServerSettingsValue(
      languageServerSettings,
      settingsKey,
      parsedSettings.value,
    );
    const currentSettings = useSettings.getState();
    const nextSettings: SettingsState = {
      ...currentSettings,
      languageServer: nextLanguageServerSettings,
    };
    const response = await route_save_settings({ settings: nextSettings });
    if (!res200(response)) {
      const errorMessage = buildPluginActionError(
        "Save language server settings",
        response,
      );
      setStatus({ type: "error", message: errorMessage });
      addTemporaryNotification(errorMessage, "error");
      return;
    }
    useSettings.setState(nextSettings);
    setStatus({
      type: "success",
      message: "Language server settings saved.",
    });
  }

  return (
    <div className="mt-2 rounded border border-setta-200 bg-white p-2 dark:border-setta-800 dark:bg-setta-950">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        settings.{settingsKey}
      </p>
      <textarea
        className="mt-1 h-24 w-full rounded border border-setta-300 bg-white p-2 font-mono text-[11px] text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
        aria-label={`settings.${settingsKey}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
        disabled={disabled}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-setta-500 dark:text-setta-400">
          Enter a JSON object for this language server settings key.
        </p>
        <button
          type="button"
          className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
          onClick={() => {
            void onSaveSettings();
          }}
          disabled={disabled}
        >
          Save Settings
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
    </div>
  );
}

function getRegisteredLanguageServers(
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

function getRegisteredExternalAgentAdapters(
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

function getRegisteredCodegenTargets(
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

function parsePluginConfigDraft(rawValue: string): {
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
        error: "Plugin config must be a JSON object.",
      };
    }
    return { value: parsed, error: null };
  } catch {
    return {
      value: {},
      error: "Plugin config JSON is invalid.",
    };
  }
}

function formatPluginConfigDraft(value: unknown): string {
  if (!isPlainObject(value)) {
    return "{}";
  }
  return JSON.stringify(value, null, 2);
}

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

function parseLanguageServerSettingsDraft(rawValue: string): {
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
        error: "Language server settings must be a JSON object.",
      };
    }
    return { value: parsed, error: null };
  } catch {
    return {
      value: {},
      error: "Language server settings JSON is invalid.",
    };
  }
}

function formatLanguageServerSettingsDraft(value: unknown): string {
  if (!isPlainObject(value)) {
    return "{}";
  }
  return JSON.stringify(value, null, 2);
}

function getLanguageServerSettingsValue(
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

function setLanguageServerSettingsValue(
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
}: {
  label: string;
  onClick: () => Promise<void>;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
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
  const detailMessage = getErrorDetail(response.data);
  if (detailMessage) {
    return `${actionLabel} failed: ${detailMessage}`;
  }
  if (response.data && typeof response.data === "object") {
    const record = response.data as Record<string, unknown>;
    const detailValue = record.detail;
    if (detailValue && typeof detailValue === "object") {
      const detailRecord = detailValue as Record<string, unknown>;
      const code = detailRecord.code;
      const message = detailRecord.message;
      if (typeof code === "string" && typeof message === "string") {
        return `${actionLabel} failed: ${code} - ${message}`;
      }
    }
  }
  return `${actionLabel} failed (status ${response.status ?? "unknown"}).`;
}

type PluginCapabilityStatus =
  | "effective"
  | "blocked"
  | "requested_unavailable"
  | "not_requested";

function getPluginCapabilityStatus(
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

function getBlockedCapabilityReason(
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

function buildCapabilityUnavailableMessage({
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

function formatCapabilitiesForTable(capabilities: string[]): string {
  if (capabilities.length === 0) {
    return "none";
  }
  return [...capabilities].sort((a, b) => a.localeCompare(b)).join(", ");
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

function validateInstallSourceSpec(sourceSpecRaw: string): string | null {
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

function buildInstallTrustSummaryMessage(
  installSummary: Pick<PluginInstallSummary, "trustStatus" | "trustWarning">,
): string {
  return `Trust (${installSummary.trustStatus}): ${installSummary.trustWarning}`;
}

function buildSourceManagerGuidanceMessage(
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

export const pluginsPaneTestApi = {
  buildInstallTrustSummaryMessage,
  buildSourceManagerGuidanceMessage,
  buildRestartActionPlan: buildPluginRestartActionPlan,
  buildCapabilityUnavailableMessage,
  formatLanguageServerSettingsDraft,
  getBlockedCapabilityReason,
  getRegisteredCodegenTargets,
  getRegisteredExternalAgentAdapters,
  getLanguageServerSettingsValue,
  getPluginCapabilityStatus,
  getRegisteredLanguageServers,
  getRestartRequiredPluginIds,
  parsePluginConfigDraft,
  parseLanguageServerSettingsDraft,
  setLanguageServerSettingsValue,
  validateInstallSourceSpec,
};

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
