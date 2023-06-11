import { createProject, getProjects } from "dbRequests/projects";
import { useState } from "react";
import {
  adjectives,
  animals,
  colors,
  uniqueNamesGenerator,
} from "unique-names-generator";

export function useGetOrCreateProjects() {
  const [projects, setProjects] = useState({});
  const fnGetProjects = async () => {
    setProjects(await getProjects());
  };
  const fnCreateProject = async ({ name }) => {
    const actualName = name ?? createProjectName();
    const newProject = await createProject({ name: actualName });
    setProjects((x) => ({ ...x, [newProject.id]: newProject }));
    return newProject;
  };

  return {
    projects,
    getProjects: fnGetProjects,
    createProject: fnCreateProject,
  };
}

function createProjectName() {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
  });
}
