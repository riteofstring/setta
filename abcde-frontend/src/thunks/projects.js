import {
  createProject as createProjectDb,
  getProjects as getProjectsDb,
  loadProject as loadProjectDb,
} from "dbRequests/projects";
import { useAuth } from "models/auth";
import { loadSections } from "models/master";

export function loadProjectIntoState({ projectInfo, excludeCodeInfo = false }) {
  let { uiTypes, baseUITypes, presetUITypes, ...theRest } = projectInfo;
  uiTypes = { ...uiTypes, ...baseUITypes, ...presetUITypes };
  loadSections({
    uiTypes,
    ...theRest,
    excludeCodeInfo,
  });
  return true;
}

export async function loadProject({ id, configId }) {
  const access_token = useAuth.getState().access_token;

  const projectInfo = await loadProjectDb({ access_token, id, configId });
  return loadProjectIntoState({ projectInfo });
}

export async function createProject({ name }) {
  const access_token = useAuth.getState().access_token;
  return await createProjectDb({ name, access_token });
}

export async function getProjects() {
  const access_token = useAuth.getState().access_token;
  return await getProjectsDb({ access_token });
}
