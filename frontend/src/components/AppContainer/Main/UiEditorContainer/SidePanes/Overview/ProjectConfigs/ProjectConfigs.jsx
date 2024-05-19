import { useOtherProjectConfigs } from "models/info/otherProjectConfigs";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import React from "react";
import { SWITCHING_CONFIG } from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";

export const ProjectConfigs = React.forwardRef(() => {
  const configNames = useOtherProjectConfigs((x) => x.x.map((c) => c.name));

  function onMouseOver(idx) {
    const config = useOtherProjectConfigs.getState().x[idx];
    if (config.name !== useProjectConfig.getState().name) {
      useProjectConfig.getState().resetAndSetAll(config);
      const projectName = useProject.getState().name;
      router.navigate(`${projectName}/${config.name}`, {
        state: { pageLoadType: SWITCHING_CONFIG },
      });
    }
  }

  return (
    <>
      <p className="text-xs text-runcoder-600 dark:text-runcoder-300">
        Hover over an item to preview another version of your project
      </p>
      <div className="mt-4 flex gap-1">
        {configNames.map((name, idx) => (
          <p
            key={idx}
            className="-mx-2 min-w-full flex-1 cursor-pointer rounded-xl px-2 py-1 text-runcoder-600 hover:bg-runcoder-100 dark:text-runcoder-400 dark:hover:bg-runcoder-800"
            onMouseOver={() => onMouseOver(idx)}
          >
            {name}
          </p>
        ))}
      </div>
    </>
  );
});
