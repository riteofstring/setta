import { useStoreActions } from "easy-peasy";
import { useState } from "react";

export function useGetOrCreateProjects() {
  const [projects, setProjects] = useState({});
  const getProjects = useStoreActions((x) => x.thunks.getProjects);
  const createProject = useStoreActions((x) => x.thunks.createProject);
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
