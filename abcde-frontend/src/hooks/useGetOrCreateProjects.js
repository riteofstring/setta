import { dbCreateProject, dbGetProjects } from "dbRequests/projects";
import { useUser } from "models/user";
import { useState } from "react";
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { NEW_PROJECT } from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";

export function useGetProjects({ nested }) {
  const [projects, setProjects] = useState([]);
  async function getProjects() {
    const res = await dbGetProjects({ nested });
    if (res.status === 200) {
      setProjects(res.data);
    }
  }

  return { projects, getProjects };
}

export async function createAndGoToProject({ name }) {
  const actualName = name ?? createProjectName();
  const { data: newProject } = await dbCreateProject({ name: actualName });
  goToDefaultConfig(newProject);
}

function createProjectName() {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
  });
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
