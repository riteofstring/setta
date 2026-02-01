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
    ? "border-blue-200/70 bg-blue-50/80 text-blue-700 hover:bg-blue-100/80 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
    : "border-setta-200/70 bg-setta-50/80 text-setta-600 hover:bg-setta-100/80 dark:border-setta-800 dark:bg-setta-900/60 dark:text-setta-300 dark:hover:bg-setta-800/60";
  const dotClasses = enabled ? "bg-blue-500" : "bg-setta-400";
  const disabledClasses = disabled ? "cursor-not-allowed opacity-60" : "";

  return (
    <button
      aria-pressed={enabled}
      aria-label={actionLabel}
      className={`nodrag relative inline-flex min-w-[96px] cursor-pointer select-none flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:ring-2 ${stateClasses} ${disabledClasses}`}
      disabled={disabled}
      title={actionLabel}
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
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-setta-500 dark:text-setta-400">
        Mode
      </span>
      <span className="flex items-center gap-2 whitespace-nowrap text-xs">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClasses}`} />
        {label}
      </span>
    </button>
  );
}
