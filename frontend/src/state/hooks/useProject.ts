import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { setCurrProjectIsInteractive } from "state/actions/interactive";
import { loadProject } from "state/actions/projects";
import { useProject } from "state/definitions/project";
import { useProjectConfig } from "state/definitions/projectConfig";
import {
  NEW_PROJECT,
  SAME_PROJECT_NEW_PROJECT_CONFIG,
  SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
  SAME_PROJECT_NEW_PROJECT_NAME,
  SWITCHING_CONFIG,
} from "utils/Routes/pageLoadTypes";

export function useLoadProject() {
  const { projectName, configName } = useParams();
  const { state } = useLocation();
  const pageLoadType = state?.pageLoadType;
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

    if (pageLoadType === SWITCHING_CONFIG) {
      return;
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

    setCurrProjectIsInteractive(projectName);
  }, [projectName, configName]);

  return doneLoading;
}
