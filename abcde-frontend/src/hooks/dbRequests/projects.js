import { createProject, getProjects, loadProject } from "dbRequests/projects";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useState } from "react";
import { loadOneProject } from "__tests__utils/loadTestData";

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

export function useLoadProject() {
  const loadSections = useStoreActions((x) => x.master.loadSections);
  const clearSections = useStoreActions((x) => x.master.clearSections);
  const access_token = useStoreState((x) => x.auth.access_token);

  return async (id, configId) => {
    const projectInfo = await loadProject({ access_token, id, configId });
    // TODO remove this
    const { projectDefaults, globalDefaults } = await loadOneProject({});
    clearSections();
    let { uiTypes, baseUITypes, presetUITypes, ...theRest } = projectInfo;
    uiTypes = { ...uiTypes, ...baseUITypes, ...presetUITypes };
    loadSections({
      projectDefaults,
      globalDefaults,
      uiTypes,
      ...theRest,
    });
    return true;
  };
}
