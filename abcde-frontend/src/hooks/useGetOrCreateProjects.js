import {
  dbCreateProject,
  dbGetProjectsForFileMenu,
  dbGetProjectsForHomePage,
} from "dbRequests/projects";
import { useUser } from "models/user";
import { useState } from "react";
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
  const username = useUser.getState().username;
  const configName = project.configs.find((x) => x.id === configId).name;
  const address = `${username}/${project.name}/${configName}`;
  router.navigate(address, { state: { pageLoadType: NEW_PROJECT } });
}

function goToDefaultConfig(project) {
  goToProject({
    project,
    configId: project.defaultConfigId,
  });
}
