import { onOverviewTabClick } from "components/Panes/paneFns";
import { usePluginRuntimeStore } from "plugins/runtime";
import { useSettings, useShareSession } from "state/definitions";
import { OverviewTabNameEnum } from "utils/constants";
import {
  PluginRuntimeStateEnum,
  type PluginStatusEntry,
} from "utils/generatedTypes";

const ACTIVE_LANGUAGE_SERVER_PLUGIN_STATES = new Set([
  PluginRuntimeStateEnum.active,
  PluginRuntimeStateEnum.pending_restart,
]);

export function LanguageServerStatusBanner() {
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const serverMode = usePluginRuntimeStore((state) => state.serverMode);
  const runtimeStatus = usePluginRuntimeStore((state) => state.status);
  const selectedPythonPlugin = useSettings(
    (state) => state.languageServer.selectedByLanguage.python,
  );
  const selectedPluginStatus = usePluginRuntimeStore((state) =>
    selectedPythonPlugin
      ? state.pluginStatusById[selectedPythonPlugin] ?? null
      : null,
  );
  const bannerMessage = buildPythonLanguageServerBanner(
    selectedPythonPlugin,
    runtimeStatus,
    selectedPluginStatus,
  );

  if (isDeploymentMode || serverMode === "app" || serverMode === "share") {
    return null;
  }
  if (bannerMessage == null) {
    return null;
  }

  return (
    <div
      data-testid="python-language-server-status-banner"
      className="ml-2 flex min-w-0 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <span className="truncate">{bannerMessage}</span>
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

function buildPythonLanguageServerBanner(
  selectedPythonPlugin: string | null | undefined,
  runtimeStatus: "idle" | "loading" | "loaded" | "error",
  selectedPluginStatus: PluginStatusEntry | null,
): string | null {
  if (selectedPythonPlugin === undefined) {
    return "Python language server is not selected. Choose a plugin in workspace settings, then restart after it is available.";
  }
  if (selectedPythonPlugin === null) {
    return "Python language server is turned off for this workspace. Select a plugin in workspace settings if you want completions and signature help.";
  }
  if (runtimeStatus !== "loaded") {
    return null;
  }
  if (selectedPluginStatus == null) {
    return `Selected Python language server plugin "${selectedPythonPlugin}" is not installed or active. Install or enable it, then restart the language server.`;
  }
  if (!entryProvidesLanguage(selectedPluginStatus, "python")) {
    return `Selected Python language server plugin "${selectedPythonPlugin}" does not provide Python. Choose a Python language server plugin in workspace settings, then restart the language server.`;
  }
  if (!entryHasActiveRuntime(selectedPluginStatus)) {
    return `Selected Python language server plugin "${selectedPythonPlugin}" is unavailable. Enable or reinstall it, then restart the language server.`;
  }
  if (entryHasAppliedLanguageServer(selectedPluginStatus, "python")) {
    return null;
  }
  return `Selected Python language server plugin "${selectedPythonPlugin}" is available, but restart is still required before it is applied.`;
}

function entryHasActiveRuntime(entry: PluginStatusEntry): boolean {
  return ACTIVE_LANGUAGE_SERVER_PLUGIN_STATES.has(entry.state);
}

function entryProvidesLanguage(
  entry: PluginStatusEntry,
  language: string,
): boolean {
  const registrations = entry.registeredLanguageServers ?? [];
  return registrations.some(
    (registration) => registration.language.toLowerCase() === language,
  );
}

function entryHasAppliedLanguageServer(
  entry: PluginStatusEntry,
  language: string,
): boolean {
  const appliedLanguages = entry.appliedLanguageServerLanguages ?? [];
  return appliedLanguages.some(
    (appliedLanguage) => appliedLanguage.toLowerCase() === language,
  );
}

function openPluginsTab(): void {
  onOverviewTabClick(OverviewTabNameEnum.Plugins);
}
