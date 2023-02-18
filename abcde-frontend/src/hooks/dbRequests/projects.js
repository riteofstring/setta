import { createProject, getProjects } from "dbRequests/projects";
import { useState } from "react";

export function useGetOrCreateProjects() {
  const [projects, setProjects] = useState({});
  const fnGetProjects = async () => {
    setProjects(await getProjects());
  };
  const fnCreateProject = async ({ name }) => {
    const newProject = await createProject({ name });
    setProjects((x) => ({ ...x, [newProject.id]: newProject }));
  };

  return {
    projects,
    getProjects: fnGetProjects,
    createProject: fnCreateProject,
  };
}
