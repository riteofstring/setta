import {
  saveAsExistingProjectConfig as saveAsExistingProjectConfigDb,
  saveAsNewProjectConfig as saveAsNewProjectConfigDb,
  saveProject as saveProjectDb,
} from "dbRequests/projects";
import { thunk } from "easy-peasy";
import _ from "lodash";
import { useAuth } from "models/auth";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useProjectToLoad } from "models/info/projectToLoad";
import { BASE, USER } from "utils/uiTypeConstants";

// s is the easy-peasy store
export function getProjectData(s) {
  const project = useProject.getState().getAll();
  const projectConfig = useProjectConfig.getState().getAll();

  const ev = _.mapValues(s.enteredValues.x, (v) =>
    _.pick(v, ["value", "childId"])
  );
  const evCols = s.paramInfos.x;
  const uiTypes = assembleUITypes(s, (v) => v.presetType !== BASE);
  const uiTypeCols = s.paramInfos.y;

  const kwargCols = s.objInfos.x;
  const kwargInfo = assembleKwargInfos(s, kwargCols);

  const sections = _.mapValues(s.sectionInfos.x, (x) =>
    _.pick(x, [
      "id",
      "name",
      "paramInfoId",
      "sectionChildrenId",
      "initialPosition",
    ])
  );

  const sectionChildren = s.sectionInfos.allChildren;
  const sectionConfigs = s.sectionConfigs.x;
  const sectionConfigCol = _.mapValues(s.sectionInfos.x, (v) => v.configId);

  return {
    project,
    projectConfig,
    ev,
    evCols,
    uiTypes,
    uiTypeCols,
    kwargInfo,
    kwargCols,
    sections,
    sectionChildren,
    sectionConfigs,
    sectionConfigCol,
  };
}

export const saveProject = thunk((actions, payload, helpers) => {
  const x = assembleProject(helpers.getStoreState(), payload.reactFlowStore);
  saveProjectDb(x);
});

export const saveAsNewProjectConfig = thunk(
  async (actions, payload, helpers) => {
    saveProjectAs({
      s: helpers.getStoreState(),
      a: helpers.getStoreActions(),
      reactFlowStore: payload.reactFlowStore,
      fn: saveAsNewProjectConfigDb,
      otherArgs: { newConfigName: payload.newConfigName },
    });
  }
);

export const saveAsExistingProjectConfig = thunk(
  async (actions, payload, helpers) => {
    saveProjectAs({
      s: helpers.getStoreState(),
      a: helpers.getStoreActions(),
      reactFlowStore: payload.reactFlowStore,
      fn: saveAsExistingProjectConfigDb,
      otherArgs: { configId: payload.configId },
    });
  }
);

async function saveProjectAs({ s, a, reactFlowStore, fn, otherArgs }) {
  const x = assembleProject(s, reactFlowStore);
  const newProjectConfig = await fn({ ...x, ...otherArgs });
  // load base and preset ui types from memory
  // because these weren't sent during saving
  // and therefore aren't returned
  newProjectConfig.baseUITypes = _.pickBy(
    s.uiTypes.x,
    (x) => x.presetType === BASE
  );
  newProjectConfig.presetUITypes = _.pickBy(
    s.uiTypes.x,
    (x) => x.presetType === USER
  );
  const zState = useProjectToLoad.getState();
  zState.setIsLoading(true);
  await a.thunks.loadProjectIntoState({
    projectInfo: newProjectConfig,
    excludeCodeInfo: true,
  });
  zState.setIsLoading(false);
}

function assembleProject(s, reactFlowStore) {
  updateInitialPositions(s, reactFlowStore);
  const access_token = useAuth.getState().access_token;
  return { project: getProjectData(s), access_token };
}

function updateInitialPositions(s, reactFlowStore) {
  const rfState = reactFlowStore.getState();
  for (const [key, value] of rfState.nodeInternals) {
    s.sectionInfos.x[key].initialPosition = { ...value.position };
  }
}

function assembleKwargInfos(s, kwargCols) {
  let kwargInfos = {};
  for (const kwargColId of _.keys(kwargCols)) {
    for (const objInfoId of _.keys(kwargCols[kwargColId])) {
      for (const kwargId of kwargCols[kwargColId][objInfoId]) {
        kwargInfos[kwargId] = s.codeInfo.allCodeInfo[kwargId];
      }
    }
  }
  return kwargInfos;
}

export function assembleUITypes(s, pickBy) {
  let uiTypes = _.pickBy(s.uiTypes.x, pickBy);
  return _.mapValues(uiTypes, (v) => _.omit(v, ["origin"]));
}
