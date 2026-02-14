import _ from "lodash";
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
import { useShareSession } from "state/definitions";
import { buildPluginPaneOverviewTabName } from "utils/constants";
import {
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "utils/endpointUtils";
import {
  route_plugins_disable,
  route_plugins_enable,
  route_plugins_install,
  route_plugins_rescan,
  route_plugins_restart,
  route_plugins_rollback,
  route_plugins_uninstall,
  route_plugins_update,
} from "utils/generatedEndpoints";
import type {
  PluginInstallRequestInput,
  PluginListEntry,
  PluginRollbackRequestInput,
  PluginUninstallRequestInput,
  PluginUpdateRequestInput,
} from "utils/generatedTypes";
import { onOverviewTabClick } from "../../paneFns";

type InstallScope = "workspace" | "environment" | "global";

type PluginActionStatus = {
  type: "error" | "success" | "warning";
  message: string;
};

export function PluginsPane() {
  const [sourceSpec, setSourceSpec] = useState("");
  const [scope, setScope] = useState<InstallScope>("workspace");
  const [enableAfterInstall, setEnableAfterInstall] = useState(true);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<PluginActionStatus | null>(
    null,
  );

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
    _.isEqual,
  );
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const writeActionsLocked =
    runtimeSummary.serverMode !== "ide" || isDeploymentMode;

  useEffect(() => {
    void refreshPluginRuntime();
  }, []);

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
    () => getRestartRequiredPluginIds(pluginListEntries),
    [pluginListEntries],
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
    setBusyActionKey(actionKey);
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
      setBusyActionKey(null);
    }
  }

  async function onInstallPlugin() {
    const sourceErrorMessage = validateInstallSourceSpec(sourceSpec);
    if (sourceErrorMessage) {
      setActionStatus({ type: "error", message: sourceErrorMessage });
      return;
    }
    const trimmedSourceSpec = sourceSpec.trim();
    const response = await runAction("install", "Install plugin", async () =>
      route_plugins_install({
        sourceSpec: trimmedSourceSpec,
        scope,
        enable: enableAfterInstall,
        force: false,
      } as PluginInstallRequestInput),
    );
    if (!response || !response.data) {
      return;
    }
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
              disabled={busyActionKey !== null}
            >
              Rescan
            </button>
            <button
              type="button"
              className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
              onClick={onRestart}
              disabled={
                busyActionKey !== null ||
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
            disabled={writeActionsLocked || busyActionKey !== null}
          />
          <div className="flex items-center gap-2">
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as InstallScope)}
              className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-800 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100"
              disabled={writeActionsLocked || busyActionKey !== null}
            >
              <option value="workspace">workspace</option>
              <option value="environment">environment</option>
              <option value="global">global</option>
            </select>
            <label className="flex items-center gap-1 text-[11px] text-setta-600 dark:text-setta-300">
              <input
                type="checkbox"
                checked={enableAfterInstall}
                onChange={(event) =>
                  setEnableAfterInstall(event.target.checked)
                }
                disabled={writeActionsLocked || busyActionKey !== null}
              />
              enable after install
            </label>
            <button
              type="button"
              className="ml-auto rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
              onClick={onInstallPlugin}
              disabled={writeActionsLocked || busyActionKey !== null}
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
                writeActionsLocked={writeActionsLocked}
                busyActionKey={busyActionKey}
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
                  <th className="px-2 py-1 font-semibold">source</th>
                </tr>
              </thead>
              <tbody>
                {sortedStatusEntries.map((entry) => (
                  <tr
                    key={`${entry.pluginId}:${entry.sourcePath}`}
                    className="border-t border-setta-200 dark:border-setta-850"
                  >
                    <td className="px-2 py-1 text-setta-800 dark:text-setta-100">
                      {entry.pluginId}
                    </td>
                    <td className="px-2 py-1">{entry.state}</td>
                    <td className="px-2 py-1">{entry.sourceScopeLabel}</td>
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
  writeActionsLocked: boolean;
  busyActionKey: string | null;
  runAction: <T>(
    actionKey: string,
    actionLabel: string,
    operation: () => Promise<ResponseDataAndStatus<T>>,
  ) => Promise<ResponseDataAndStatus<T> | null>;
};

function PluginListEntryCard({
  plugin,
  writeActionsLocked,
  busyActionKey,
  runAction,
}: PluginListEntryCardProps) {
  const panes = usePluginRuntimeStore(
    (state) => state.panesByPluginId[plugin.pluginId] ?? [],
    _.isEqual,
  );
  const commands = usePluginRuntimeStore(
    (state) => state.commandsByPluginId[plugin.pluginId] ?? [],
    _.isEqual,
  );
  const frontendError = usePluginRuntimeStore(
    (state) => state.frontendErrorsByPluginId[plugin.pluginId] ?? null,
    _.isEqual,
  );

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

  const pluginActionDisabled = writeActionsLocked || busyActionKey !== null;
  const paneButtonsDisabled = pluginActionDisabled;

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
          disabled={pluginActionDisabled}
        />
        <ActionButton
          label="Disable"
          onClick={onDisable}
          disabled={pluginActionDisabled}
        />
        <ActionButton
          label="Update"
          onClick={onUpdate}
          disabled={pluginActionDisabled}
        />
        <ActionButton
          label="Rollback"
          onClick={onRollback}
          disabled={pluginActionDisabled}
        />
        <ActionButton
          label="Uninstall"
          onClick={onUninstall}
          disabled={pluginActionDisabled}
        />
      </div>

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
      ) : null}
    </article>
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

export const pluginsPaneTestApi = {
  buildRestartActionPlan: buildPluginRestartActionPlan,
  getRestartRequiredPluginIds,
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
