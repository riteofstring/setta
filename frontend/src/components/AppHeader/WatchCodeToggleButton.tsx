import * as Switch from "@radix-ui/react-switch";
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

  const actionLabel = enabled ? "Disable Watch Code" : "Enable Watch Code";

  return (
    <Switch.Root
      aria-label={actionLabel}
      title={actionLabel}
      className="nodrag relative inline-flex h-2.5 w-7 min-w-7 cursor-pointer items-center rounded-full bg-setta-400 p-[0.2rem] [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black focus-visible:ring-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 data-[state='checked']:bg-blue-500 dark:bg-setta-600 dark:data-[state='checked']:bg-blue-700"
      checked={enabled}
      disabled={disabled}
      onCheckedChange={(checked) => {
        if (disabled) {
          return;
        }
        void route_set_watch_code_enabled({
          projectConfigId,
          enabled: checked,
        });
      }}
    >
      <Switch.Thumb className="block h-2.5 w-2.5 rounded-full bg-white transition-all will-change-transform data-[state='checked']:translate-x-4 dark:bg-setta-800" />
    </Switch.Root>
  );
}
