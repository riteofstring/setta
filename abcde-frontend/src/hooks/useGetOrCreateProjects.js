import { dbCreateProject, dbGetProjects } from "dbRequests/projects";
import { useAuth } from "models/auth";
import { useState } from "react";
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { NEW_PROJECT } from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";

export function useGetOrCreateProjects() {
  const [projects, setProjects] = useState({});
  async function getProjects() {
    const res = await dbGetProjects();
    if (res.status === 200) {
      setProjects(res.data);
    }
  }

  const createAndGoToProject = async ({ name }) => {
    const actualName = name ?? createProjectName();
    const { data: newProject } = await dbCreateProject({ name: actualName });
    setProjects((x) => ({ ...x, [newProject.id]: newProject }));
    goToDefaultConfig(newProject);
  };

  return {
    projects,
    getProjects,
    createAndGoToProject,
  };
}

function createProjectName() {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
  });
}

function goToProject({ project, configId }) {
  const username = useAuth.getState().username;
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
