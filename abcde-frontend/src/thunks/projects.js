import {
  createProject as createProjectDb,
  getProjects as getProjectsDb,
  loadProject as loadProjectDb,
} from "dbRequests/projects";
import { thunk } from "easy-peasy";
import { loadOneProject } from "__tests__utils/loadTestData.mjs";

export const loadProjectIntoState = thunk(async (actions, payload, helpers) => {
  const { projectInfo, excludeCodeInfo = false } = payload;
  const a = helpers.getStoreActions();

  const { projectDefaults, globalDefaults } = await loadOneProject({});
  let { uiTypes, baseUITypes, presetUITypes, ...theRest } = projectInfo;
  uiTypes = { ...uiTypes, ...baseUITypes, ...presetUITypes };
  a.master.loadSections({
    projectDefaults,
    globalDefaults,
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
  const access_token = s.auth.access_token;

  const projectInfo = await loadProjectDb({ access_token, id, configId });
  return await a.thunks.loadProjectIntoState({ projectInfo });
});

export const createProject = thunk(async (actions, payload, helpers) => {
  const { name } = payload;
  const access_token = helpers.getStoreState().auth.access_token;
  return await createProjectDb({ name, access_token });
});

export const getProjects = thunk(async (actions, payload, helpers) => {
  const access_token = helpers.getStoreState().auth.access_token;
  return await getProjectsDb({ access_token });
});
