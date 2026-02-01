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

  const stateClasses = enabled
    ? "text-blue-600 hover:text-blue-500 dark:text-blue-400"
    : "text-setta-700 hover:text-setta-900 dark:text-setta-100";
  const disabledClasses = disabled ? "cursor-not-allowed opacity-60" : "";

  return (
    <button
      aria-pressed={enabled}
      className={`nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-2 text-xs font-semibold transition-colors focus-visible:ring-2 active:!bg-blue-100 dark:hover:bg-setta-800 active:dark:!bg-blue-950 ${stateClasses} ${disabledClasses}`}
      disabled={disabled}
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
      <RiRadarLine />
      Watch Code
    </button>
  );
}
