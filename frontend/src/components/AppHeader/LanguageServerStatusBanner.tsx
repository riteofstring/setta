import { onOverviewTabClick } from "components/Panes/paneFns";
import { usePluginRuntimeStore } from "plugins/runtime";
import { useShareSession } from "state/definitions";
import { OverviewTabNameEnum } from "utils/constants";
import {
  SelectedLanguageServerStateEnum,
  type SelectedLanguageServerStatus,
} from "utils/generatedTypes";

type BannerModel = {
  message: string;
};

export function LanguageServerStatusBanner() {
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const serverMode = usePluginRuntimeStore((state) => state.serverMode);
  const runtimeStatus = usePluginRuntimeStore((state) => state.status);
  const pythonStatus = usePluginRuntimeStore(
    (state) =>
      state.selectedLanguageServers.find(
        (status) => status.languageId === "python",
      ) ?? null,
  );

  const banner = buildPythonLanguageServerBanner({
    pythonStatus,
    runtimeStatus,
  });

  if (isDeploymentMode || serverMode === "app" || serverMode === "share") {
    return null;
  }
  if (banner == null) {
    return null;
  }

  return (
    <div
      data-testid="python-language-server-status-banner"
      className="ml-2 flex min-w-0 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <span className="truncate">{banner.message}</span>
      <button
        type="button"
        className="rounded border border-amber-400 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-900"
        onClick={openPluginsTab}
      >
        Plugins
      </button>
    </div>
  );
}

function buildPythonLanguageServerBanner({
  pythonStatus,
  runtimeStatus,
}: {
  pythonStatus: SelectedLanguageServerStatus | null;
  runtimeStatus: "idle" | "loading" | "loaded" | "error";
}): BannerModel | null {
  if (runtimeStatus !== "loaded" || pythonStatus == null) {
    return null;
  }

  const message = buildPythonLanguageServerMessage(pythonStatus);
  if (message == null) {
    return null;
  }
  return { message };
}

function buildPythonLanguageServerMessage(
  pythonStatus: SelectedLanguageServerStatus,
): string | null {
  switch (pythonStatus.state) {
    case SelectedLanguageServerStateEnum.not_selected:
      return pythonStatus.applied
        ? "Python language server is not selected. Choose a plugin in workspace settings, then restart after it is available."
        : "Python language server is no longer selected. Restart the language server to apply this change, or choose a plugin in workspace settings.";
    case SelectedLanguageServerStateEnum.disabled:
      return pythonStatus.applied
        ? "Python language server is turned off for this workspace. Select a plugin in workspace settings if you want completions and signature help."
        : "Python language server is turned off for this workspace, but restart is still required to apply this change.";
    case SelectedLanguageServerStateEnum.ready:
      if (pythonStatus.applied) {
        return null;
      }
      return `Selected Python language server plugin "${pythonStatus.selectedPluginId}" is ready, but restart is still required before Python completions and signature help become available.`;
    case SelectedLanguageServerStateEnum.selected_plugin_missing:
      return buildSelectedPluginMissingMessage(pythonStatus);
    case SelectedLanguageServerStateEnum.selected_plugin_wrong_language:
      return buildSelectedPluginWrongLanguageMessage(pythonStatus);
    case SelectedLanguageServerStateEnum.selected_plugin_unavailable:
      return buildSelectedPluginUnavailableMessage(pythonStatus);
    default:
      return null;
  }
}

function buildSelectedPluginMissingMessage(
  pythonStatus: SelectedLanguageServerStatus,
): string {
  if (pythonStatus.applied) {
    return `Selected Python language server plugin "${pythonStatus.selectedPluginId}" is no longer installed or active, but the currently applied Python server will remain available until restart. Reinstall or enable it before restarting, or choose a different plugin in workspace settings.`;
  }
  return `Selected Python language server plugin "${pythonStatus.selectedPluginId}" is not installed or active. Install or enable it, then restart the language server.`;
}

function buildSelectedPluginWrongLanguageMessage(
  pythonStatus: SelectedLanguageServerStatus,
): string {
  if (pythonStatus.applied) {
    return `Selected Python language server plugin "${pythonStatus.selectedPluginId}" does not provide Python, but the currently applied Python server will remain available until restart. Choose a Python language server plugin in workspace settings before restarting.`;
  }
  return `Selected Python language server plugin "${pythonStatus.selectedPluginId}" does not provide Python. Choose a Python language server plugin in workspace settings, then restart the language server.`;
}

function buildSelectedPluginUnavailableMessage(
  pythonStatus: SelectedLanguageServerStatus,
): string {
  if (pythonStatus.applied) {
    return `Selected Python language server plugin "${pythonStatus.selectedPluginId}" is unavailable, but the currently applied Python server will remain available until restart. Enable or reinstall it before restarting, or choose a different plugin.`;
  }
  return `Selected Python language server plugin "${pythonStatus.selectedPluginId}" is unavailable. Enable or reinstall it, then restart the language server.`;
}

function openPluginsTab(): void {
  onOverviewTabClick(OverviewTabNameEnum.Plugins);
}
