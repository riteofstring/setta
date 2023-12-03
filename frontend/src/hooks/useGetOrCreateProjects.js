import {
  dbCreateProject,
  dbGetProjectsForFileMenu,
  dbGetProjectsForHomePage,
  dbLoadFullProject,
} from "dbRequests/projects";
import { useProject } from "models/info/project";
import { useState } from "react";
import { getProjectData } from "thunks/save";
import { NEW_PROJECT } from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";

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

export async function createAndGoToProject({ name }) {
  const { data: newProject } = await dbCreateProject({ name });
  goToDefaultConfig(newProject);
}

function goToProject({ project, configId }) {
  const configName = project.configs.find((x) => x.id === configId).name;
  const address = `${project.name}/${configName}`;
  router.navigate(address, { state: { pageLoadType: NEW_PROJECT } });
}

function goToDefaultConfig(project) {
  goToProject({
    project,
    configId: project.defaultConfigId,
  });
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
