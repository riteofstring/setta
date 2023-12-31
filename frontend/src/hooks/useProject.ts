import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useEffect, useState } from "react";
import { loadProject } from "thunks/user/projects";
import {
  NEW_PROJECT,
  SAME_PROJECT_NEW_PROJECT_CONFIG,
  SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
  SAME_PROJECT_NEW_PROJECT_NAME,
} from "utils/Routes/pageLoadTypes";

// setDoneLoading sets the doneLoading state in MainContainer
export function useLoadProject({ projectName, configName, pageLoadType }) {
  const [doneLoading, setDoneLoading] = useState(false);

  useEffect(() => {
    async function loadAllProjectData() {
      setDoneLoading(false);
      const res = await loadProject({
        projectName,
        configName,
      });
      setDoneLoading(res);
    }

    // The first if-statement triggers for a page refresh or navigating to a different project
    if (
      !doneLoading ||
      [NEW_PROJECT, SAME_PROJECT_NEW_PROJECT_CONFIG].includes(pageLoadType)
    ) {
      loadAllProjectData();
    } else if (pageLoadType === SAME_PROJECT_NEW_PROJECT_NAME) {
      useProject.getState().setName(projectName);
    } else if (pageLoadType === SAME_PROJECT_NEW_PROJECT_CONFIG_NAME) {
      useProjectConfig.getState().setName(configName);
    }
  }, [projectName, configName]);

  return doneLoading;
}
