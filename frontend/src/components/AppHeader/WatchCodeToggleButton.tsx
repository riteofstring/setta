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
    ? "border-blue-500 text-blue-500 dark:border-blue-600 dark:text-blue-600"
    : "border-setta-200/70 text-setta-600 dark:border-setta-800 dark:text-setta-300";
  const bgClasses = enabled
    ? "bg-blue-50/70 dark:bg-blue-950/50"
    : "bg-white/70 dark:bg-setta-900/50";
  const disabledClasses = disabled ? "cursor-not-allowed opacity-60" : "";

  return (
    <button
      aria-label={actionLabel}
      aria-pressed={enabled}
      title={actionLabel}
      className={`nodrag inline-flex w-full select-none items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors focus-visible:ring-2 ${bgClasses} ${stateClasses} ${disabledClasses}`}
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
