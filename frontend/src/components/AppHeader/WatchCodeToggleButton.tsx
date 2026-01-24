import { useMemo } from "react";
import { RiEyeLine } from "react-icons/ri";
import { useAllProjectMetadata, useProjectState } from "state/definitions";
import { route_set_watch_code_config } from "utils/generatedEndpoints";

export function WatchCodeToggleButton() {
  const projectConfig = useProjectState((x) => x.projectConfig);
  const enabled = projectConfig.watchCodeEnabled ?? false;
  const stateClasses = enabled
    ? "text-blue-600 hover:text-blue-500 dark:text-blue-400"
    : "text-setta-700 hover:text-setta-900 dark:text-setta-100";
  const payload = useMemo(
    () => ({
      projectConfigId: projectConfig.id,
      watchCodeEnabled: !enabled,
      watchCodeFolders: projectConfig.watchCodeFolders ?? [],
      watchCodeFiles: projectConfig.watchCodeFiles ?? [],
    }),
    [
      enabled,
      projectConfig.id,
      projectConfig.watchCodeFiles,
      projectConfig.watchCodeFolders,
    ],
  );

  return (
    <button
      aria-pressed={enabled}
      className={`nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-2 text-xs font-semibold transition-colors focus-visible:ring-2 active:!bg-blue-100 dark:hover:bg-setta-800 active:dark:!bg-blue-950 ${stateClasses}`}
      onClick={() => {
        void route_set_watch_code_config(payload);
        useProjectState.setState((state) => {
          state.projectConfig.watchCodeEnabled = !enabled;
        });
        useAllProjectMetadata.setState((state) => ({
          ...state,
          projectMetadata: state.projectMetadata.map((entry) =>
            entry.id === projectConfig.id
              ? { ...entry, watchCodeEnabled: !enabled }
              : entry,
          ),
        }));
      }}
    >
      <RiEyeLine />
      Watch Code
    </button>
  );
}
