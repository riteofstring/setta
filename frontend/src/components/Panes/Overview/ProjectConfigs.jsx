import { router } from "components/Pages/router";
import { Toggle } from "components/Utils/atoms/toggles/Toggle";
import _ from "lodash";
import React from "react";
import { toggleProjectConfigPreviewEnabled } from "state/actions/localStorage";
import { setNodes } from "state/actions/nodeInternals";
import { loadProjectState } from "state/actions/project/loadProject";
import { setProjectConfig } from "state/actions/project/projectConfig";
import {
  useAllProjectConfigs,
  useCurrProjectBackup,
  usePreviewIsLoading,
} from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { useLoadFullProject } from "state/hooks/project";
import { PAGE_LOAD_TYPES } from "utils/constants";

export const ProjectConfigs = React.forwardRef(() => {
  const allConfigNames = useAllProjectConfigs((x) => x.names);
  const [previewEnabled] = localStorageFns.projectConfigPreviewEnabled.hook();
  const { doneLoading, currProjectConfigName, previewedProjectConfigName } =
    useLoadFullProject(previewEnabled);
  const configLoadingStatus = usePreviewIsLoading(
    (x) => ({
      isLoading: x.isLoading,
      name: x.name,
    }),
    _.isEqual,
  );

  console.log("configLoadingStatus", configLoadingStatus);

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
          onMouseLeave={() =>
            onMouseLeave({
              previewEnabled,
              previewedProjectConfigName,
              currProjectConfigName,
            })
          }
        >
          {doneLoading ? (
            allConfigNames.map((name, idx) => (
              <p
                key={idx}
                className={`${previewedProjectConfigName === name ? "font-bold" : ""} min-w-full cursor-pointer rounded-xl px-2 py-1 text-setta-600 [transition:font-weight_100ms_ease-in-out] hover:bg-blue-300/40 hover:text-setta-900 dark:text-setta-400 dark:hover:bg-blue-900/50 dark:hover:text-setta-100`}
                onMouseOver={() => {
                  onMouseOver({
                    previewEnabled,
                    mousedOverName: name,
                    previewedProjectConfigName,
                    currProjectConfigName,
                  });
                }}
                onClick={() =>
                  onClick({ currProjectConfigName, clickedOnName: name })
                }
              >
                {name}
                {configLoadingStatus.isLoading &&
                  configLoadingStatus.name === name &&
                  " Loading..."}
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

function onMouseOver({
  previewEnabled,
  mousedOverName,
  previewedProjectConfigName,
  currProjectConfigName,
}) {
  // preview not enabled, or mousedOverName is already being previewed
  if (!previewEnabled || mousedOverName === previewedProjectConfigName) {
    return;
  }

  usePreviewIsLoading.setState({
    isLoading: true,
    name: mousedOverName,
  });
  // Without the following hacky code, previewIsLoading will go from true to false too quickly
  // so react will basically ignore it.
  setTimeout(
    () =>
      onMouseOverHelper({
        mousedOverName,
        previewedProjectConfigName,
        currProjectConfigName,
      }),
    10,
  );
}

function onMouseOverHelper({
  mousedOverName,
  previewedProjectConfigName,
  currProjectConfigName,
}) {
  // if we mouse over the config for the currently loaded page
  // then load the backup state.
  if (mousedOverName === currProjectConfigName) {
    loadProjectState(useCurrProjectBackup.getState());
  }
  // if we're looking at the data for the currently loaded page
  // and we want to preview anything else
  // then we want to load the other merged config
  else if (previewedProjectConfigName === currProjectConfigName) {
    const projectConfig =
      useAllProjectConfigs.getState().metadata[mousedOverName];
    loadProjectState({ ...useAllProjectConfigs.getState().x, projectConfig });
  } else {
    const projectConfig =
      useAllProjectConfigs.getState().metadata[mousedOverName];
    setProjectConfig(_.omit(projectConfig, ["children"]));
    setNodes(
      _.map(projectConfig.children, (v, k) => ({
        id: k,
        position: { x: v.x, y: v.y },
        zIndex: v.zIndex,
        tempZIndex: v.zIndex,
      })),
    );
  }
}

function onClick({ currProjectConfigName, clickedOnName }) {
  if (clickedOnName !== currProjectConfigName) {
    router.navigate(clickedOnName, {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  }
}

function onMouseLeave({
  previewEnabled,
  previewedProjectConfigName,
  currProjectConfigName,
}) {
  if (previewEnabled && previewedProjectConfigName !== currProjectConfigName) {
    usePreviewIsLoading.setState({
      isLoading: true,
      name: currProjectConfigName,
    });
    setTimeout(() => loadProjectState(useCurrProjectBackup.getState()), 10);
  }
}
