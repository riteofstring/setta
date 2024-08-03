import { router } from "components/Pages/router";
import { Toggle } from "components/Utils/atoms/toggles/Toggle";
import React from "react";
import { toggleProjectConfigPreviewEnabled } from "state/actions/localStorage";
import { loadProjectState } from "state/actions/project/loadProject";
import {
  useAllProjectConfigs,
  useCurrProjectBackup,
  useProjectConfig,
} from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { useLoadFullProject } from "state/hooks/project";
import { PAGE_LOAD_TYPES } from "utils/constants";

export const ProjectConfigs = React.forwardRef(() => {
  const allConfigNames = useAllProjectConfigs((x) =>
    x.x.map((c) => c.projectConfig.name),
  );
  const [previewEnabled] = localStorageFns.projectConfigPreviewEnabled.hook();
  const { doneLoading, currProjectConfigName, previewedProjectConfigName } =
    useLoadFullProject(previewEnabled);

  function onMouseLeave() {
    if (previewEnabled) {
      loadProjectState(useCurrProjectBackup.getState());
    }
  }

  return (
    <>
      <aside className="mb-2 flex items-center justify-between">
        <p className="text-setta-500">Toggle config previews.</p>
        <Toggle
          checked={previewEnabled}
          onCheckedChange={toggleProjectConfigPreviewEnabled}
          twThumbClasses="flex"
        />
      </aside>
      {/* 
      <p className="text-xs text-setta-600 dark:text-setta-300">
        Hover over an item to preview another version of your project
      </p> */}
      <section className=" flex h-full overflow-y-scroll rounded-lg border border-setta-200/50 p-1 dark:border-setta-850">
        <div
          className="mt-1 flex w-full flex-col gap-1"
          onMouseLeave={onMouseLeave}
        >
          {doneLoading ? (
            allConfigNames.map((name, idx) => (
              <p
                key={idx}
                className={`${previewedProjectConfigName === name ? "font-bold" : ""} min-w-full cursor-pointer rounded-xl px-2 py-1 text-setta-600 [transition:font-weight_100ms_ease-in-out] hover:bg-blue-300/40 hover:text-setta-900 dark:text-setta-400 dark:hover:bg-blue-900/50 dark:hover:text-setta-100`}
                onMouseOver={() => {
                  onMouseOver(previewEnabled, idx);
                }}
                onClick={() => onClick(currProjectConfigName, idx)}
              >
                {name}
              </p>
            ))
          ) : (
            <i className="gg-spinner self-center justify-self-end text-blue-500/70" />
          )}
        </div>
      </section>
    </>
  );
});

function onMouseOver(previewEnabled, idx) {
  if (!previewEnabled) {
    return;
  }
  const config = useAllProjectConfigs.getState().x[idx];
  if (config.projectConfig.name !== useProjectConfig.getState().name) {
    loadProjectState(config);
  }
}

function onClick(currProjectConfigName, idx) {
  const config = useAllProjectConfigs.getState().x[idx];
  if (config.projectConfig.name !== currProjectConfigName) {
    router.navigate(config.projectConfig.name, {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  }
}
