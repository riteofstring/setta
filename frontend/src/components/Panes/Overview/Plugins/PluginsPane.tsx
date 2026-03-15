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
} from "plugins/runtime";
import { useMemo, useRef, useState } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import { useProjectState, useShareSession } from "state/definitions";
import { C } from "utils/c";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_plugins_disable,
  route_plugins_enable,
  route_plugins_install,
  route_plugins_rescan,
} from "utils/generatedEndpoints";
import type {
  PluginInstallResponse,
  PluginRestartCapability,
  PluginStatusEntry,
} from "utils/generatedTypes";
import {
  buildBusyPluginIdSet,
  buildPluginActionError,
  buildPluginActionThrownError,
  buildPluginListEntryCardKey,
  formatBlockedCapabilitiesForTableCached,
  formatBlockedCapabilitiesTooltip,
  formatCapabilitiesForTableCached,
  formatCapabilitiesTooltip,
  getActionStatusClassName,
  validateInstallSourceSpec,
} from "./PluginsPane.helpers";
import { PluginListEntryCard } from "./pluginsPanePluginCard";
import { ActionButton, InstallSummaryCard } from "./pluginsPaneShared";

type InstallScope = "workspace" | "setta_files" | "global";
type InstallBackend = "auto" | "pip" | "uv";

type PluginActionStatus = {
  type: "error" | "success" | "warning";
  message: string;
};

type PluginInstallSummary = PluginInstallResponse;

type PluginsPaneRuntimeSummary = {
  status: string;
  statusMessage: string | null;
  restartCapability: PluginRestartCapability | null;
  serverMode: "ide" | "share" | "app" | "launcher";
};

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
  const inFlightActionKeysRef = useRef<Set<string>>(new Set());

  const pluginListEntries = usePluginListEntries();
  const pluginStatusEntries = usePluginStatusEntries();
  const runtimeSummary = usePluginRuntimeStore(
    (state) => ({
      status: state.status,
      statusMessage: state.statusMessage,
      restartCapability: state.restartCapability,
      serverMode: state.serverMode,
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
      if (refreshRuntimeOnSuccess) {
        await refreshPluginRuntime();
        const runtimeState = usePluginRuntimeStore.getState();
        if (runtimeState.status === "error") {
          const runtimeStatusMessage = runtimeState.statusMessage?.trim();
          const detail =
            runtimeStatusMessage && runtimeStatusMessage.length > 0
              ? runtimeStatusMessage
              : "unknown runtime error.";
          setActionStatus({
            type: "warning",
            message: `${actionLabel} completed, but runtime refresh failed: ${detail}`,
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
    return busyPluginIds.has(pluginId);
  }

  async function runEnablePlugin(pluginId: string) {
    await runAction(`enable:${pluginId}`, "Enable plugin", async () =>
      route_plugins_enable({ pluginId }),
    );
  }

  async function runDisablePlugin(pluginId: string) {
    await runAction(`disable:${pluginId}`, "Disable plugin", async () =>
      route_plugins_disable({ pluginId }),
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
    const sourceErrorMessage = validateInstallSourceSpec(sourceSpec);
    if (sourceErrorMessage) {
      setActionStatus({ type: "error", message: sourceErrorMessage });
      return;
    }
    setInstallSummary(null);
    const trimmedSourceSpec = sourceSpec.trim();
    const installRequest = {
      sourceSpec: trimmedSourceSpec,
      scope,
      installer,
      enable: enableAfterInstall,
      force: false,
    };
    const response = await runAction("install", "Install plugin", async () =>
      route_plugins_install(installRequest),
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
      route_plugins_rescan(),
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
      <section className="rounded-md border border-setta-200 bg-white p-2 dark:border-setta-850 dark:bg-setta-900">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-tight text-setta-500 dark:text-setta-400">
            Plugin Runtime
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
              onClick={onRescan}
              disabled={writeActionsLocked || isActionBusy("rescan")}
            >
              Rescan
            </button>
            <button
              type="button"
              className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
              onClick={onRestart}
              disabled={
                writeActionsLocked ||
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
          {runtimeSummary.status}
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
                key={buildPluginListEntryCardKey(plugin)}
                plugin={plugin}
                isSettingsProject={isSettingsProject}
                writeActionsLocked={writeActionsLocked}
                isAnyPluginActionBusy={isAnyPluginActionBusy}
                runEnablePlugin={runEnablePlugin}
                runDisablePlugin={runDisablePlugin}
                runAction={runAction}
              />
            ))}
          </div>
        )}
      </section>

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
                    <td className="px-2 py-1">
                      {renderStatusRowAction(entry)}
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
