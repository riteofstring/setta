import { useOtherProjectConfigs } from "models/info/otherProjectConfigs";
import { useProjectConfig } from "models/info/projectConfig";
import React from "react";

export const ProjectConfigs = React.forwardRef(() => {
  const configNames = useOtherProjectConfigs((x) => x.x.map((c) => c.name));

  function onMouseOver(idx) {
    const config = useOtherProjectConfigs.getState().x[idx];
    if (config.name !== useProjectConfig.getState().name) {
      useProjectConfig.getState().resetAndSetAll(config);
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
