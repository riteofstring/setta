import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  dbGetProjectsForFileMenu,
  dbGetProjectsForHomePage,
  dbLoadFullProject,
} from "requests/projects";
import { setCurrProjectIsInteractive } from "state/actions/interactive";
import { loadProject } from "state/actions/project/loadProject";
import { setProjectName } from "state/actions/project/project";
import { setProjectConfigName } from "state/actions/project/projectConfig";
import { getProjectData } from "state/actions/project/saveProject";
import { useProject } from "state/definitions";
import {
  NEW_PROJECT,
  SAME_PROJECT_NEW_PROJECT_CONFIG,
  SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
  SAME_PROJECT_NEW_PROJECT_NAME,
  SWITCHING_CONFIG,
} from "utils/Routes/pageLoadTypes";

function useGetProjects(getter) {
  const [projects, setProjects] = useState([]);
  async function getProjects(props) {
    const res = await getter(props);
    if (res.status === 200) {
      setProjects(res.data);
    }
  }
  return { projects, getProjects };
}

export function useGetProjectsForFileMenu() {
  return useGetProjects(dbGetProjectsForFileMenu);
}

export function useGetProjectsForHomePage() {
  return useGetProjects(dbGetProjectsForHomePage);
}

export function useExportProjectJson() {
  const [projectJson, setProjectJson] = useState({});
  function exportProjectJson() {
    const { project, ...theRest } = getProjectData();
    setProjectJson(theRest);
  }
  async function exportFullProjectJson() {
    const projectName = useProject.getState().name;
    const res = await dbLoadFullProject({ projectName });
    if (res.status === 200) {
      setProjectJson(res.data);
    }
  }

  return { projectJson, exportProjectJson, exportFullProjectJson };
}

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
      setProjectName(projectName);
    } else if (pageLoadType === SAME_PROJECT_NEW_PROJECT_CONFIG_NAME) {
      setProjectConfigName(configName);
    }

    setCurrProjectIsInteractive(projectName);
  }, [projectName, configName]);

  return doneLoading;
}
