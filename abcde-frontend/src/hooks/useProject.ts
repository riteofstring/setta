import { useAuth } from "models/auth";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useProjectToLoad } from "models/info/projectToLoad";
import { useEffect, useState } from "react";
import { loadProject } from "thunks/projects";

// setDoneLoading sets the doneLoading state in MainContainer
export function useLoadProject(projectName, configName) {
  const [doneLoading, setDoneLoading] = useState(false);
  const isAuthenticated = useAuth((x) => x.isAuthenticated);
  const isLoading = useProjectToLoad((x) => x.isLoading);

  useEffect(() => {
    async function fn() {
      setDoneLoading(false);
      const result = await loadProject({
        projectName,
        configName,
      });
      setDoneLoading(result);
    }

    if (isAuthenticated && projectName && configName) {
      fn();
    }
  }, [projectName, configName]);

  useEffect(() => {
    // If data is being loaded outside of here, and doneLoading = true
    // then set doneLoading to false.
    // Must compare to boolean values to prevent changes on initial render.
    if (isLoading === true) {
      setDoneLoading(false);
    } else if (isLoading === false) {
      setDoneLoading(true);
    }
  }, [isLoading]);

  return doneLoading;
}

export function useCurrProjectName() {
  const projectName = useProject((x) => x.name);
  const configName = useProjectConfig((x) => x.name);
  return { projectName, configName };
}
