import { router } from "components/Pages/router";
import { Toggle } from "components/Utils/atoms/toggles/Toggle";
import _ from "lodash";
import React from "react";
import { toggleProjectConfigPreviewEnabled } from "state/actions/localStorage";
import { setNodes } from "state/actions/nodeInternals";
import { setProjectConfig } from "state/actions/project/projectConfig";
import { useAllProjectConfigs, useProjectConfig } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { PAGE_LOAD_TYPES } from "utils/constants";

export const ProjectConfigs = React.forwardRef(() => {
  const configNames = useAllProjectConfigs((x) => x.x.map((c) => c.name));
  const currConfigName = useProjectConfig((x) => x.name);
  const [previewEnabled] = localStorageFns.projectConfigPreviewEnabled.hook();

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
        <div className="mt-1 flex w-full flex-col gap-1">
          {configNames.map((name, idx) => (
            <p
              key={idx}
              className={`${currConfigName === name ? "font-bold" : ""} min-w-full cursor-pointer rounded-xl px-2 py-1 text-setta-600 [transition:font-weight_100ms_ease-in-out] hover:bg-blue-300/40 hover:text-setta-900 dark:text-setta-400 dark:hover:bg-blue-900/50 dark:hover:text-setta-100`}
              onMouseOver={() => {
                previewEnabled && onMouseOver(idx);
              }}
              onClick={() => onClick(idx)}
            >
              {name}
            </p>
          ))}
        </div>
      </section>
    </>
  );
});

function onMouseOver(idx) {
  const config = useAllProjectConfigs.getState().x[idx];
  if (config.name !== useProjectConfig.getState().name) {
    setProjectConfig(_.omit(config, ["viewport", "children"]));
    setNodes(
      _.map(config.children, (v, k) => ({
        id: k,
        position: { x: v.x, y: v.y },
        zIndex: v.zIndex,
        tempZIndex: v.zIndex,
      })),
    );
  }
}

function onClick(idx) {
  const config = useAllProjectConfigs.getState().x[idx];
  if (config.name !== useProjectConfig.getState().name) {
    router.navigate(config.name, {
      state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
    });
  }
}
