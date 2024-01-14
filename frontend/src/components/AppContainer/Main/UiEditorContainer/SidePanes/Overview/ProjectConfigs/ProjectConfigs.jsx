import { dbLoadFullProject } from "dbRequests/projects";
import _ from "lodash";
import { useProject } from "models/info/project";
import React, { useEffect, useState } from "react";
import { loadProjectState } from "thunks/loadProjectState";

export const ProjectConfigs = React.forwardRef(() => {
  //   const otherConfigIds = useOtherProjectConfigs((x) => Object.keys(x.x));

  //   const currConfigName = useProjectConfig((x) => x.name);
  const [fullProject, setFullProject] = useState(null);

  const configNames = fullProject
    ? fullProject.configs.map((c) => c.projectConfig.name)
    : [];
  console.log(configNames);

  useEffect(() => {
    async function fn() {
      const res = await dbLoadFullProject({
        projectName: useProject.getState().name,
        withBaseUITypes: true,
      });
      if (res.status === 200) {
        setFullProject(res.data);
      }
    }

    fn();
  }, []);

  function onMouseOver(idx) {
    const config = fullProject.configs[idx];
    loadProjectState({ project: _.omit(fullProject, ["configs"]), ...config });
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
