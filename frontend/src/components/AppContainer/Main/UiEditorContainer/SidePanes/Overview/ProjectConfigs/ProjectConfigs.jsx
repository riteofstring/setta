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
    <div className="mt-10 flex justify-center">
      <div>
        {configNames.map((name, idx) => (
          <div
            key={idx}
            className="mb-4 flex items-center"
            onMouseOver={() => onMouseOver(idx)}
          >
            <label className="mr-2 text-white">{name}</label>
          </div>
        ))}
      </div>
    </div>
  );
});
