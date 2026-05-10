import { onOverviewTabClick } from "components/Panes/paneFns";
import { usePluginRuntimeStore } from "plugins/runtime";
import { useShareSession } from "state/definitions";
import {
  LanguageServerSelectionStatusKindEnum,
  OverviewTabUIConfig,
} from "utils/generatedTypes";

const PYTHON_LANGUAGE_ID = "python";

export function LanguageServerStatusBanner() {
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const serverMode = usePluginRuntimeStore((state) => state.serverMode);
  const runtimeStatus = usePluginRuntimeStore((state) => state.status);
  const pythonSelectionStatus = usePluginRuntimeStore(
    (state) => state.languageServerSelectionsByLanguage[PYTHON_LANGUAGE_ID],
  );

  if (
    isDeploymentMode ||
    runtimeStatus !== "loaded" ||
    serverMode !== "ide" ||
    !pythonSelectionStatus ||
    pythonSelectionStatus.status ===
      LanguageServerSelectionStatusKindEnum.active
  ) {
    return null;
  }

  return (
    <div
      data-testid="python-language-server-status-banner"
      className="ml-2 flex min-w-0 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <span className="truncate">{pythonSelectionStatus.message}</span>
      <button
        type="button"
        className="rounded border border-amber-400 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-900"
        onClick={openPluginsTab}
      >
        Configure
      </button>
    </div>
  );
}

function openPluginsTab(): void {
  onOverviewTabClick(OverviewTabUIConfig.names.Plugins);
}
