import { SectionConfigColType } from "abcde-utils/src/types/sectionConfigCol";
import { ManySectionCoreInfoType } from "abcde-utils/src/types/sectionInfo";
import { PresetType } from "abcde-utils/src/types/uiType";
import {
  saveAsExistingProjectConfig as saveAsExistingProjectConfigDb,
  saveAsNewProjectConfig as saveAsNewProjectConfigDb,
  saveProject as saveProjectDb,
} from "dbRequests/projects";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useEnteredValues } from "models/info/enteredValues";
import { useObjInfos } from "models/info/objInfos";
import { useParamInfos } from "models/info/paramInfos";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useProjectToLoad } from "models/info/projectToLoad";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { loadProjectIntoState } from "./projects";

export function getProjectData() {
  const project = useProject.getState().getAll();
  const projectConfig = useProjectConfig.getState().getAll();

  const ev = useEnteredValues.getState().x;
  const evCols = useParamInfos.getState().x;
  const uiTypes = assembleUITypes(
    useUITypes.getState().x,
    (v) => v.presetType !== PresetType.BASE
  );
  const uiTypeCols = useParamInfos.getState().y;

  const kwargCols = useObjInfos.getState().x;
  const kwargInfo = assembleKwargInfos(kwargCols);

  const sectionInfosState = useSectionInfos.getState();
  const sections: ManySectionCoreInfoType = _.mapValues(
    sectionInfosState.x,
    (x) =>
      _.pick(x, [
        "id",
        "name",
        "paramInfoId",
        "sectionChildrenId",
        "initialPosition",
      ])
  );

  const sectionChildren = sectionInfosState.allChildren;
  const sectionConfigs = useSectionConfigs.getState().x;
  const sectionConfigCol: SectionConfigColType = _.mapValues(
    sectionInfosState.x,
    (v) => v.configId
  );

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

export function saveProject({ reactFlowStore }) {
  const x = assembleProject(reactFlowStore);
  saveProjectDb(x);
}

export async function saveAsNewProjectConfig({
  reactFlowStore,
  newConfigName,
}) {
  saveProjectAs({
    reactFlowStore,
    fn: saveAsNewProjectConfigDb,
    otherArgs: { newConfigName },
  });
}

export async function saveAsExistingProjectConfig({
  reactFlowStore,
  configId,
}) {
  saveProjectAs({
    reactFlowStore,
    fn: saveAsExistingProjectConfigDb,
    otherArgs: { configId },
  });
}

async function saveProjectAs({ reactFlowStore, fn, otherArgs }) {
  const x = assembleProject(reactFlowStore);
  const newProjectConfig = await fn({ ...x, ...otherArgs });
  const uiTypesState = useUITypes.getState();
  // load base and preset ui types from memory
  // because these weren't sent during saving
  // and therefore aren't returned
  newProjectConfig.baseUITypes = _.pickBy(
    uiTypesState.x,
    (x) => x.presetType === PresetType.BASE
  );
  newProjectConfig.presetUITypes = _.pickBy(
    uiTypesState.x,
    (x) => x.presetType === PresetType.USER
  );
  const zState = useProjectToLoad.getState();
  zState.setIsLoading(true);
  loadProjectIntoState({
    projectInfo: newProjectConfig,
    excludeCodeInfo: true,
  });
  zState.setIsLoading(false);
}

function assembleProject(reactFlowStore) {
  updateInitialPositions(reactFlowStore);
  return { project: getProjectData() };
}

function updateInitialPositions(reactFlowStore) {
  const rfState = reactFlowStore.getState();
  const newValues = {};
  for (const [key, value] of rfState.nodeInternals) {
    newValues[key] = { initialPosition: value.position };
  }
  useSectionInfos.getState().setSectionInfoAttrObjInput({ newValues });
}

function assembleKwargInfos(kwargCols) {
  let kwargInfos = {};
  const codeInfoState = useCodeInfo.getState();
  for (const kwargCol of Object.values(kwargCols)) {
    for (const kwargIds of Object.values(kwargCol)) {
      for (const kwargId of kwargIds) {
        kwargInfos[kwargId] = codeInfoState.allCodeInfo[kwargId];
      }
    }
  }
  return kwargInfos;
}

export function assembleUITypes(s, pickBy) {
  return _.pickBy(s, pickBy);
}
