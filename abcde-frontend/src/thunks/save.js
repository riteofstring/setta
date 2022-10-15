import { saveProject as saveProjectDb } from "dbRequests/projects";
import { thunk } from "easy-peasy";

export const saveProject = thunk((actions, payload, helpers) => {
  const s = helpers.getStoreState();
  const access_token = s.auth.access_token;

  const projectId = s.currProject.id;

  const ev = s.enteredValues.x;
  const evCols = s.paramInfos.x;
  const uiTypes = _.pickBy(s.uiTypes.x, (v) => !v.presetType);
  const uiTypeCols = s.paramInfos.y;
  const kwargCols = s.objInfos.x;

  const sections = _.mapValues(s.sectionInfos.x, (x) => ({
    id: x.id,
    name: x.name,
    paramInfoId: x.paramInfoId,
  }));

  const sectionChildren = s.sectionInfos.idsOverview;
  const sectionConfigs = s.sectionConfigs.x;

  const project = {
    ev,
    evCols,
    uiTypes,
    uiTypeCols,
    kwargCols,
    sections,
    sectionChildren,
    sectionConfigs,
  };

  saveProjectDb({ access_token, project });
});
