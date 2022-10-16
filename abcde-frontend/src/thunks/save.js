import { saveProject as saveProjectDb } from "dbRequests/projects";
import { thunk } from "easy-peasy";
import _ from "lodash";

export const saveProject = thunk((actions, payload, helpers) => {
  const s = helpers.getStoreState();
  const access_token = s.auth.access_token;

  const projectId = s.project.id;

  const ev = s.enteredValues.x;
  const evCols = s.paramInfos.x;
  const uiTypes = _.pickBy(s.uiTypes.x, (v) => !v.presetType);
  const uiTypesCols = s.paramInfos.y;

  const kwargCols = s.objInfos.x;
  const kwargInfos = getKwargInfos(s, kwargCols);

  const sections = _.mapValues(s.sectionInfos.x, (x) => ({
    id: x.id,
    name: x.name,
    paramInfoId: x.paramInfoId,
  }));

  const sectionChildrenIds = _.mapValues(
    s.sectionInfos.x,
    (x) => x.sectionChildrenId
  );
  const sectionChildren = s.sectionInfos.idsOverview;
  const sectionConfigs = s.sectionConfigs.x;

  const sectionConfigCols = {
    [s.project.sectionConfigColId]: _.mapValues(
      s.sectionInfos.x,
      (v) => v.configId
    ),
  };

  const project = {
    ev,
    evCols,
    uiTypes,
    uiTypesCols,
    kwargInfos,
    kwargCols,
    sections,
    sectionChildren,
    sectionChildrenIds,
    sectionConfigs,
    sectionConfigCols,
  };

  saveProjectDb({ access_token, project });
});

function getKwargInfos(s, kwargCols) {
  let kwargInfos = {};
  for (const kwargColId of _.keys(kwargCols)) {
    for (const objInfoId of _.keys(kwargCols[kwargColId])) {
      for (const kwargId of kwargCols[kwargColId][objInfoId]) {
        kwargInfos[kwargId] = s.codeInfo.allObjInfo[kwargId];
      }
    }
  }
  return kwargInfos;
}
