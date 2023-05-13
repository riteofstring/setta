import { ManyCodeInfoType } from "abcde-utils/src/types/codeInfo";
import { ManyKwargColType } from "abcde-utils/src/types/kwargCol";
import { ProjectSaveType } from "abcde-utils/src/types/projectSaveLoad";
import { ManySectionCoreType } from "abcde-utils/src/types/section";
import { SectionConfigColType } from "abcde-utils/src/types/sectionConfigCol";
import { ManyUITypeType } from "abcde-utils/src/types/uiType";
import {
  isBasePreset,
  isPreset,
  isUserPreset,
} from "abcde-utils/src/uiTypeConstants";
import {
  saveAsExistingProjectConfig as saveAsExistingProjectConfigDb,
  saveAsNewProjectConfig as saveAsNewProjectConfigDb,
  saveProject as saveProjectDb,
} from "dbRequests/projects";
import _ from "lodash";
import { useProjectConfigCodeInfoMaps } from "models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "models/codeInfoMaps/userCodeInfoMaps";
import { useCodeInfo } from "models/info/codeInfo";
import { useEnteredValues } from "models/info/enteredValues";
import { useKwargCols } from "models/info/kwargCols";
import { useParamInfos } from "models/info/paramInfos";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionDescription } from "models/info/sectionDescription";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { xnor } from "utils/utils";

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
      "size",
      "chainedFrom",
    ])
  );

  const sectionChildren = sectionInfosState.allChildren;
  const sectionConfigs = useSectionConfigs.getState().x;
  const sectionConfigCol: SectionConfigColType = _.mapValues(
    sectionInfosState.x,
    (v) => v.configId
  );
  const sectionDescriptions = useSectionDescription.getState().x;

  const projectConfigCodeInfoMaps = useProjectConfigCodeInfoMaps
    .getState()
    .exportForDb();

  const output = {
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
    sectionDescriptions,
    projectConfigCodeInfoMaps,
  };
  // console.log(output);

  return output;
}

export function saveProject() {
  const x = assembleProject();
  saveProjectDb(x);
}

export async function saveAsNewProjectConfig({ newConfigName }) {
  return await saveProjectAs({
    fn: saveAsNewProjectConfigDb,
    otherArgs: { newConfigName },
  });
}

export async function saveAsExistingProjectConfig({ configId }) {
  return await saveProjectAs({
    fn: saveAsExistingProjectConfigDb,
    otherArgs: { configId },
  });
}

async function saveProjectAs({ fn, otherArgs }) {
  const x = assembleProject();
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
  newProjectConfig.userCodeInfoMaps = useUserCodeInfoMaps
    .getState()
    .exportForDb();
  return newProjectConfig;
}

function assembleProject() {
  return { project: getProjectData() };
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
  _isPreset: boolean
): ManyUITypeType {
  return _.pickBy(s, (v) => xnor(_isPreset, isPreset(v)));
}
