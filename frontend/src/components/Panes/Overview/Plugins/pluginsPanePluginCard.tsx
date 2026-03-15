import { usePluginRuntimeStore } from "plugins/runtime";
import { useMemo } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import { buildPluginPaneOverviewTabName } from "utils/constants";
import type { ResponseDataAndStatus } from "utils/endpointUtils";
import {
  route_plugins_rollback,
  route_plugins_uninstall,
  route_plugins_update,
} from "utils/generatedEndpoints";
import type { PluginListEntry, PluginStatusEntry } from "utils/generatedTypes";
import { onOverviewTabClick } from "../../paneFns";
import {
  buildCapabilityStatusIndex,
  buildCapabilityUnavailableMessage,
  buildSourceManagerGuidanceMessage,
  getRegisteredCodegenTargets,
  getRegisteredExternalAgentAdapters,
  getRegisteredLanguageServers,
  isLinkedLocalPluginSource,
} from "./PluginsPane.helpers";
import {
  LanguageServerSettingsEditor,
  PluginConfigEditor,
} from "./pluginsPaneConfigEditors";
import { ActionButton, CapabilityRow } from "./pluginsPaneShared";

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
  serverMode: "ide" | "share" | "app" | "launcher";
  pluginStatus: PluginStatusEntry | null;
  panes: readonly PluginPaneSummary[];
  commands: readonly PluginCommandSummary[];
  frontendError: {
    code: string;
    message: string;
  } | null;
};

type PluginListEntryCardProps = {
  plugin: PluginListEntry;
  isSettingsProject: boolean;
  writeActionsLocked: boolean;
  isAnyPluginActionBusy: (pluginId: string) => boolean;
  runEnablePlugin: (pluginId: string) => Promise<void>;
  runDisablePlugin: (pluginId: string) => Promise<void>;
  runAction: <T>(
    actionKey: string,
    actionLabel: string,
    operation: () => Promise<ResponseDataAndStatus<T>>,
  ) => Promise<ResponseDataAndStatus<T> | null>;
};

const EMPTY_PLUGIN_PANES: readonly PluginPaneSummary[] = [];
const EMPTY_PLUGIN_COMMANDS: readonly PluginCommandSummary[] = [];

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

export function PluginListEntryCard({
  plugin,
  isSettingsProject,
  writeActionsLocked,
  isAnyPluginActionBusy,
  runEnablePlugin,
  runDisablePlugin,
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

  async function onUpdate() {
    const updateRequest = {
      pluginId: plugin.pluginId,
      scope: plugin.sourceScope,
      to: null,
    };
    await runAction(`update:${plugin.pluginId}`, "Update plugin", async () =>
      route_plugins_update(updateRequest),
    );
  }

  async function onRollback() {
    const rollbackRequest = {
      pluginId: plugin.pluginId,
      scope: plugin.sourceScope,
    };
    await runAction(
      `rollback:${plugin.pluginId}`,
      "Rollback plugin",
      async () => route_plugins_rollback(rollbackRequest),
    );
  }

  async function onUninstall() {
    const uninstallRequest = {
      pluginId: plugin.pluginId,
      scope: plugin.sourceScope,
    };
    await runAction(
      `uninstall:${plugin.pluginId}`,
      "Uninstall plugin",
      async () => route_plugins_uninstall(uninstallRequest),
    );
  }

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
  const registeredLanguageServers = getRegisteredLanguageServers(pluginStatus);
  const registeredExternalAgentAdapters =
    getRegisteredExternalAgentAdapters(pluginStatus);
  const registeredCodegenTargets = getRegisteredCodegenTargets(pluginStatus);
  const capabilityStatusIndex = useMemo(() => {
    return buildCapabilityStatusIndex({
      requestedCapabilities,
      effectiveCapabilities,
      blockedCapabilities,
      capabilityList: [
        "registerCommand",
        "registerPane",
        "registerLanguageServer",
        "registerExternalAgentAdapter",
        "registerCodegenTarget",
      ],
    });
  }, [blockedCapabilities, effectiveCapabilities, requestedCapabilities]);
  const commandCapabilityStatus =
    capabilityStatusIndex.capabilityStatusByCapability.get("registerCommand") ??
    "not_requested";
  const paneCapabilityStatus =
    capabilityStatusIndex.capabilityStatusByCapability.get("registerPane") ??
    "not_requested";
  const commandCapabilityReason =
    capabilityStatusIndex.blockedReasonByCapability.get("registerCommand") ??
    null;
  const paneCapabilityReason =
    capabilityStatusIndex.blockedReasonByCapability.get("registerPane") ?? null;
  const languageServerCapabilityStatus =
    capabilityStatusIndex.capabilityStatusByCapability.get(
      "registerLanguageServer",
    ) ?? "not_requested";
  const languageServerCapabilityReason =
    capabilityStatusIndex.blockedReasonByCapability.get(
      "registerLanguageServer",
    ) ?? null;
  const externalAgentCapabilityStatus =
    capabilityStatusIndex.capabilityStatusByCapability.get(
      "registerExternalAgentAdapter",
    ) ?? "not_requested";
  const externalAgentCapabilityReason =
    capabilityStatusIndex.blockedReasonByCapability.get(
      "registerExternalAgentAdapter",
    ) ?? null;
  const codegenCapabilityStatus =
    capabilityStatusIndex.capabilityStatusByCapability.get(
      "registerCodegenTarget",
    ) ?? "not_requested";
  const codegenCapabilityReason =
    capabilityStatusIndex.blockedReasonByCapability.get(
      "registerCodegenTarget",
    ) ?? null;

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
          onClick={() => runEnablePlugin(plugin.pluginId)}
          disabled={pluginActionDisabled}
        />
        <ActionButton
          label="Disable"
          onClick={() => runDisablePlugin(plugin.pluginId)}
          disabled={pluginActionDisabled}
        />
        <ActionButton
          label="Update"
          onClick={onUpdate}
          disabled={
            pluginActionDisabled || packageManagerManaged || linkedLocalSource
          }
        />
        <ActionButton
          label="Rollback"
          onClick={onRollback}
          disabled={
            pluginActionDisabled || packageManagerManaged || linkedLocalSource
          }
        />
        <ActionButton
          label="Uninstall"
          onClick={onUninstall}
          disabled={pluginActionDisabled || packageManagerManaged}
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
      {linkedLocalSource ? (
        <section
          data-testid={`plugin-linked-source-guidance-${plugin.pluginId}`}
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
