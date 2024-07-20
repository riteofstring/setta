import {
  dbCreateProject,
  dbGetProjectsForFileMenu,
  dbGetProjectsForHomePage,
  dbLoadFullProject,
} from "dbRequests/projects";
import { useProject } from "state/definitions/project";
import { useState } from "react";
import { getProjectData } from "state/actions/save";
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
  const previewImgColor = getRandomPastelColor();
  const { data: newProject } = await dbCreateProject({ name, previewImgColor });
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

const pastelColors = [
  "bg-red-500/60 dark:bg-red-600/30",
  "bg-pink-500/60 dark:bg-pink-600/30",
  "bg-purple-500/60 dark:bg-purple-600/30",
  "bg-indigo-500/60 dark:bg-indigo-600/30",
  "bg-blue-500/60 dark:bg-blue-600/30",
  "bg-green-500/60 dark:bg-green-600/30",
  "bg-yellow-500/60 dark:bg-yellow-600/30",
  "bg-orange-500/60 dark:bg-orange-600/30",
];

const getRandomPastelColor = () => {
  const randomIndex = Math.floor(Math.random() * pastelColors.length);
  return pastelColors[randomIndex];
};
