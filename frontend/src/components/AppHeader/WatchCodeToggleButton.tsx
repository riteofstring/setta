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
    ? "border-blue-500/80 bg-blue-50 text-blue-700 hover:bg-blue-100/80 dark:border-blue-500/70 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
    : "border-setta-200 bg-white text-setta-600 hover:bg-setta-50 hover:text-setta-800 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-50";
  const disabledClasses = disabled ? "cursor-not-allowed opacity-60" : "";

  return (
    <button
      aria-label={actionLabel}
      aria-pressed={enabled}
      title={actionLabel}
      className={`nodrag inline-flex w-full select-none items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors focus-visible:ring-2 box-border ${stateClasses} ${disabledClasses}`}
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
