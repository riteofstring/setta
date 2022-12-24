import { ManyCodeInfoType } from "abcde-utils/src/types/codeInfo";
import { ManyKwargColType } from "abcde-utils/src/types/kwargCol";
import { ProjectSaveType } from "abcde-utils/src/types/projectSaveLoad";
import { ManySectionCoreType } from "abcde-utils/src/types/section";
import { SectionConfigColType } from "abcde-utils/src/types/sectionConfigCol";
import { ManyUITypeType } from "abcde-utils/src/types/uiType";
import { isBasePreset, isUserPreset } from "abcde-utils/src/uiTypeConstants";
import {
  saveAsExistingProjectConfig as saveAsExistingProjectConfigDb,
  saveAsNewProjectConfig as saveAsNewProjectConfigDb,
  saveProject as saveProjectDb,
} from "dbRequests/projects";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useEnteredValues } from "models/info/enteredValues";
import { useKwargCols } from "models/info/kwargCols";
import { useParamInfos } from "models/info/paramInfos";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useProjectToLoad } from "models/info/projectToLoad";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { xnor } from "utils/utils";
import { loadProjectIntoState } from "./projects";

export function getProjectData(): ProjectSaveType {
  const project = useProject.getState().getAll();
  const projectConfig = useProjectConfig.getState().getAll();

  const ev = useEnteredValues.getState().x;
  const evCols = useParamInfos.getState().x;
  const uiTypes = assembleUITypes(useUITypes.getState().x, false);
  const uiTypeCols = useParamInfos.getState().y;

  const kwargCols = useKwargCols.getState().x;
  const kwargInfo = assembleKwargInfos(kwargCols);

  const sectionInfosState = useSectionInfos.getState();
  const sections: ManySectionCoreType = _.mapValues(sectionInfosState.x, (x) =>
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
  newProjectConfig.baseUITypes = _.pickBy(uiTypesState.x, (x) =>
    isBasePreset(x)
  );
  newProjectConfig.presetUITypes = _.pickBy(uiTypesState.x, (x) =>
    isUserPreset(x)
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

function assembleKwargInfos(kwargCols: ManyKwargColType) {
  const kwargInfos: ManyCodeInfoType = {};
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

export function assembleUITypes(
  s: ManyUITypeType,
  isBase: boolean
): ManyUITypeType {
  return _.pickBy(s, (v) => xnor(isBase, isBasePreset(v)));
}
