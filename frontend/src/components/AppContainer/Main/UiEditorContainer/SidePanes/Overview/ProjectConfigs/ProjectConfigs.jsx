import React from "react";
import { setProjectConfig } from "state/actions/projectConfig";
import { useOtherProjectConfigs } from "state/definitions/otherProjectConfigs";
import { useProject } from "state/definitions/project";
import { useProjectConfig } from "state/definitions/projectConfig";
import { SWITCHING_CONFIG } from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";

export const ProjectConfigs = React.forwardRef(() => {
  const configNames = useOtherProjectConfigs((x) => x.x.map((c) => c.name));

  function onMouseOver(idx) {
    const config = useOtherProjectConfigs.getState().x[idx];
    if (config.name !== useProjectConfig.getState().name) {
      setProjectConfig(config);
      const projectName = useProject.getState().name;
      router.navigate(`${projectName}/${config.name}`, {
        state: { pageLoadType: SWITCHING_CONFIG },
      });
    }
  }
  const currConfigName = useProjectConfig((x) => x.name);

  return (
    <>
      <p className="text-xs text-setta-600 dark:text-setta-300">
        Hover over an item to preview another version of your project
      </p>
      <section className="-mx-1 mt-2 flex h-full overflow-visible overflow-y-scroll rounded-lg bg-white/50 p-1 dark:bg-setta-950">
        <div className="mt-1 flex w-full flex-col gap-1">
          {configNames.map((name, idx) => (
            <p
              key={idx}
              className={`${currConfigName === name ? "font-bold" : ""} min-w-full cursor-pointer rounded-xl px-2 py-1 text-setta-600 [transition:font-weight_100ms_ease-in-out] hover:bg-blue-300/40 hover:text-setta-900 dark:text-setta-400 dark:hover:bg-blue-900/50 dark:hover:text-setta-100`}
              onMouseOver={() => onMouseOver(idx)}
            >
              {name}
            </p>
          ))}
        </div>
      </section>
    </>
  );
});
