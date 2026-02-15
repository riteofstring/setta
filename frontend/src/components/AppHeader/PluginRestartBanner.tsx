import { onOverviewTabClick } from "components/Panes/paneFns";
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
import { useMemo, useState } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import { useShareSession } from "state/definitions";
import { OverviewTabNameEnum } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import { route_plugins_restart } from "utils/generatedEndpoints";

export function PluginRestartBanner() {
  const [isRestarting, setIsRestarting] = useState(false);
  const pluginListEntries = usePluginListEntries();
  const pluginStatusEntries = usePluginStatusEntries();
  const restartCapability = usePluginRuntimeStore(
    (state) => state.restartCapability,
  );
  const serverMode = usePluginRuntimeStore((state) => state.serverMode);
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);

  const restartRequiredPluginIds = useMemo(
    () => getRestartRequiredPluginIds(pluginListEntries, pluginStatusEntries),
    [pluginListEntries, pluginStatusEntries],
  );
  const restartActionPlan = useMemo(
    () => buildPluginRestartActionPlan(restartCapability),
    [restartCapability],
  );

  if (restartRequiredPluginIds.length === 0) {
    return null;
  }

  if (isDeploymentMode || serverMode !== "ide") {
    return null;
  }

  async function onRestart() {
    if (restartActionPlan.mode !== "programmatic" || isRestarting) {
      return;
    }
    setIsRestarting(true);
    let shouldRefreshRuntime = true;
    try {
      const response = await route_plugins_restart();
      if (!res200(response)) {
        addTemporaryNotification("Restart request failed.", "error");
        return;
      }
      if (response.data.accepted) {
        shouldRefreshRuntime = false;
        addTemporaryNotification("Restart request accepted.", "info");
        return;
      }
      const command = response.data.command ?? "setta";
      addTemporaryNotification(
        `Manual restart required: ${command}`,
        "warning",
      );
    } finally {
      setIsRestarting(false);
      if (shouldRefreshRuntime) {
        await refreshPluginRuntime();
      }
    }
  }

  function onOpenPlugins() {
    onOverviewTabClick(OverviewTabNameEnum.Plugins);
  }

  const pluginCountLabel =
    restartRequiredPluginIds.length === 1
      ? "1 plugin"
      : `${restartRequiredPluginIds.length} plugins`;

  return (
    <div className="ml-2 flex min-w-0 items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-950/40 dark:text-yellow-200">
      <span className="truncate">Restart required for {pluginCountLabel}</span>
      {restartActionPlan.mode === "programmatic" ? (
        <button
          type="button"
          className="rounded border border-yellow-400 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-yellow-800 hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200 dark:hover:bg-yellow-900"
          onClick={() => {
            void onRestart();
          }}
          disabled={isRestarting}
        >
          {isRestarting ? "Restarting..." : "Restart"}
        </button>
      ) : (
        <code className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] dark:bg-yellow-900/70">
          {restartActionPlan.mode === "manual"
            ? restartActionPlan.command
            : "setta"}
        </code>
      )}
      <button
        type="button"
        className="rounded border border-yellow-400 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-yellow-800 hover:bg-yellow-100 dark:border-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200 dark:hover:bg-yellow-900"
        onClick={onOpenPlugins}
      >
        Plugins
      </button>
    </div>
  );
}
