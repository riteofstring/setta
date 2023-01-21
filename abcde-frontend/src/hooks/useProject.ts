import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useEffect, useState } from "react";
import { loadProject, loadProjectIntoState } from "thunks/projects";

// setDoneLoading sets the doneLoading state in MainContainer
export function useLoadProject({
  username,
  projectName,
  configName,
  newProjectConfig,
}) {
  const [doneLoading, setDoneLoading] = useState(false);

  useEffect(() => {
    async function fn() {
      setDoneLoading(false);
      const result = await loadProject({
        username,
        projectName,
        configName,
      });
      setDoneLoading(result);
    }

    if (newProjectConfig) {
      loadProjectIntoState({
        projectInfo: newProjectConfig,
        excludeCodeInfo: true,
      });
    } else if (username && projectName && configName) {
      fn();
    }
  }, [username, projectName, configName]);

  return doneLoading;
}

export function useCurrProjectName() {
  const projectName = useProject((x) => x.name);
  const configName = useProjectConfig((x) => x.name);
  return { projectName, configName };
}
