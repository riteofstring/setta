import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useEffect, useState } from "react";
import { loadProject, loadProjectIntoState } from "thunks/projects";
import {
  NEW_PROJECT,
  SAME_PROJECT_NEW_PROJECT_CONFIG,
  SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
  SAME_PROJECT_NEW_PROJECT_NAME,
} from "utils/Routes/pageLoadTypes";

// setDoneLoading sets the doneLoading state in MainContainer
export function useLoadProject({
  username,
  projectName,
  configName,
  pageLoadType,
  newProjectConfig,
}) {
  const [doneLoading, setDoneLoading] = useState(false);

  useEffect(() => {
    async function loadAllProjectData() {
      setDoneLoading(false);
      const result = await loadProject({
        username,
        projectName,
        configName,
      });
      setDoneLoading(result);
    }

    if (pageLoadType === SAME_PROJECT_NEW_PROJECT_CONFIG) {
      loadProjectIntoState({
        projectInfo: newProjectConfig,
        excludeCodeInfo: true,
      });
    } else if (pageLoadType === SAME_PROJECT_NEW_PROJECT_NAME) {
      useProject.getState().setName(projectName);
    } else if (pageLoadType === SAME_PROJECT_NEW_PROJECT_CONFIG_NAME) {
      useProjectConfig.getState().setName(configName);
    } else if (pageLoadType === NEW_PROJECT) {
      loadAllProjectData();
    }
  }, [username, projectName, configName]);

  return doneLoading;
}
