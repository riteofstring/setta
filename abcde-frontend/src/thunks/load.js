import { loadProject as loadProjectDb } from "dbRequests/projects";
import { thunk } from "easy-peasy";
import { loadOneProject } from "__tests__utils/loadTestData.mjs";

export const loadProject = thunk(async (actions, payload, helpers) => {
  const { id, configId } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();
  const access_token = s.auth.access_token;

  const projectInfo = await loadProjectDb({ access_token, id, configId });
  // TODO remove this
  const { projectDefaults, globalDefaults } = await loadOneProject({});
  a.master.clearSections();
  let { uiTypes, baseUITypes, presetUITypes, ...theRest } = projectInfo;
  uiTypes = { ...uiTypes, ...baseUITypes, ...presetUITypes };
  a.master.loadSections({
    projectDefaults,
    globalDefaults,
    uiTypes,
    ...theRest,
  });
  return true;
});
