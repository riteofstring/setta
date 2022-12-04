import {
  createProject as createProjectDb,
  getProjects as getProjectsDb,
  loadProject as loadProjectDb,
} from "dbRequests/projects";
import { thunk } from "easy-peasy";
import { useAuth } from "models/auth";
import { loadSections } from "models/master";

export const loadProjectIntoState = thunk(async (actions, payload, helpers) => {
  const { projectInfo, excludeCodeInfo = false } = payload;

  let { uiTypes, baseUITypes, presetUITypes, ...theRest } = projectInfo;
  uiTypes = { ...uiTypes, ...baseUITypes, ...presetUITypes };
  loadSections({
    uiTypes,
    ...theRest,
    excludeCodeInfo,
  });
  return true;
});

export const loadProject = thunk(async (actions, payload, helpers) => {
  const { id, configId } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const access_token = useAuth.getState().access_token;

  const projectInfo = await loadProjectDb({ access_token, id, configId });
  return await a.thunks.loadProjectIntoState({ projectInfo });
});

export const createProject = thunk(async (actions, payload, helpers) => {
  const { name } = payload;
  const access_token = useAuth.getState().access_token;
  return await createProjectDb({ name, access_token });
});

export const getProjects = thunk(async (actions, payload, helpers) => {
  const access_token = useAuth.getState().access_token;
  return await getProjectsDb({ access_token });
});
