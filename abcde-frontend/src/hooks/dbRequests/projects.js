import { createProject, getProjects } from "dbRequests/projects";
import { useStoreState } from "easy-peasy";
import { useState } from "react";

export function useGetOrCreateProjects() {
  const [projects, setProjects] = useState({});
  const access_token = useStoreState((x) => x.auth.access_token);
  const fnGetProjects = async () => {
    setProjects(await getProjects({ access_token }));
  };
  const fnCreateProject = async ({ name }) => {
    const newProject = await createProject({ name, access_token });
    setProjects((x) => ({ ...x, [newProject.id]: newProject }));
  };

  return {
    projects,
    getProjects: fnGetProjects,
    createProject: fnCreateProject,
  };
}
