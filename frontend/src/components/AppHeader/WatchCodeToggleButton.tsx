import { RiRadarLine } from "react-icons/ri";
import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { route_set_watch_code_enabled } from "utils/generatedEndpoints";

export function WatchCodeToggleButton() {
  const enabled = useProjectState(
    (state) => state.projectConfig.watchCodeEnabled,
  );
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const isShareMode = useShareSession((state) => state.isShareMode);
  const disabled = isShareMode || projectConfigId === NULL_PROJECT_CONFIG_ID;

  const label = enabled ? "Enabled" : "Disabled";
  const actionLabel = enabled ? "Disable Watch Code" : "Enable Watch Code";
  const stateClasses = enabled
    ? "border-blue-300 bg-blue-50 text-blue-700 hover:border-blue-400 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-600/70 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:border-blue-500 dark:hover:bg-blue-900/40 dark:hover:text-blue-100"
    : "border-setta-200/80 bg-white text-setta-600 hover:border-setta-300 hover:bg-setta-50 hover:text-setta-800 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:border-setta-600 dark:hover:bg-setta-850 dark:hover:text-setta-50";
  const disabledClasses = disabled ? "cursor-not-allowed opacity-60" : "";

  return (
    <button
      aria-label={actionLabel}
      aria-pressed={enabled}
      title={actionLabel}
      className={`nodrag box-border inline-flex w-full max-w-full cursor-pointer select-none items-center justify-center gap-2 rounded-md border border-solid px-3 py-2 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/40 ${stateClasses} ${disabledClasses}`}
      disabled={disabled}
      type="button"
      onClick={() => {
        if (disabled) {
          return;
        }
        void route_set_watch_code_enabled({
          projectConfigId,
          enabled: !enabled,
        });
      }}
    >
      <RiRadarLine size={14} />
      {label}
    </button>
  );
}
