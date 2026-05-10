import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";

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
} from "openapi/http";

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

import { useMemo, useRef, useState } from "react";

import { addTemporaryNotification } from "state/actions/notifications";

import { useProjectState, useShareSession } from "state/definitions";

import { C } from "utils/c";

import type {
  LanguageServerSelectionStatus,
  PluginBlockedCapability,
  PluginInstallResponse,
  PluginListEntry,
  PluginStatusEntry,
} from "utils/generatedTypes";

import {
  PluginInstallerBackendEnum,
  PluginRuntimeStateEnum,
  PluginScopeEnum,
} from "utils/generatedTypes";

import {
  buildBusyPluginIdSet,
  buildCapabilityStatusIndex,
  buildCapabilityUnavailableMessage,
} from "../PluginsPane.helpers";

import {
  ActivePluginsSection,
  DEFAULT_PLUGIN_SERVER_MODE,
  InstallBackend,
  InstallScope,
  PYTHON_LANGUAGE_ID,
  PluginActionStatus,
  PluginCommandSummary,
  PluginDiscoveryStatusSection,
  PluginInstallSummary,
  PluginListEntryCardRuntimeState,
  PluginPaneSummary,
  PluginsPaneActionStatusNotice,
  PluginsPaneInstallSection,
  PluginsPaneRestartRequiredNotice,
  PluginsPaneRuntimeCard,
  PythonLanguageServerSection,
  pluginsPaneRuntimeSummaryEqual,
  refreshPluginRuntimeWithWarning,
  updateBusyActionKeySet,
} from "./installAndDiscovery";

import {
  CapabilityRow,
  PluginConfigEditor,
  PluginListEntryCardBadges,
} from "./pluginConfigEditor";

import {
  ActionButton,
  InstallSummaryCard,
  buildPluginActionError,
  buildPluginActionThrownError,
} from "./pluginUtils";

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

export type PluginListEntryCardProps = {
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

export function buildPluginToggleLabel(
  pluginStatus: PluginStatusEntry | null,
): "Enable" | "Disable" {
  return pluginStatus == null ||
    pluginStatus.state === PluginRuntimeStateEnum.disabled
    ? "Enable"
    : "Disable";
}

export function buildPythonPluginSelectionState(
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

export function PluginSourceGuidanceNotices({
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

export function PluginConfigSection({
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

export function PluginCapabilitiesSection({
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

export function PluginCommandsSection({
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

export function PluginFrontendErrorNotice({
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

export function PluginPanesSection({
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

export function resolvePluginCapabilitySummary({
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

export async function runUpdatePluginAction(
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

export async function runRollbackPluginAction(
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

export async function runUninstallPluginAction(
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

export type PluginListEntryCardViewProps = {
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

export function PluginListEntryCardHeader({
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
