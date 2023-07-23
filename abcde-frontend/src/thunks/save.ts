import { ManyCodeInfoType } from "abcde-utils/src/types/codeInfo";
import { ManyKwargColType } from "abcde-utils/src/types/kwargCol";
import { ProjectSaveType } from "abcde-utils/src/types/projectSaveLoad";
import { ManySectionTypeSaveProjectToBackend } from "abcde-utils/src/types/section";
import { ManyUITypeType } from "abcde-utils/src/types/uiType";
import { isPreset } from "abcde-utils/src/uiTypeConstants";
import {
  dbSaveProject,
  saveAsExistingProjectConfig as saveAsExistingProjectConfigDb,
  saveAsNewProjectConfig as saveAsNewProjectConfigDb,
} from "dbRequests/projects";
import _ from "lodash";
import { useProjectConfigCodeInfoMaps } from "models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useCodeInfo } from "models/info/codeInfo";
import { useEnteredValues } from "models/info/enteredValues";
import { useKwargCols } from "models/info/kwargCols";
import { useParamInfos } from "models/info/paramInfos";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { useNotification } from "models/notification";
import { xnor } from "utils/utils";

export function getProjectData(): ProjectSaveType {
  const project = useProject.getState().getAll();
  const projectConfig = useProjectConfig.getState().getAll();

  const ev = useEnteredValues.getState().x;
  const evCols = useParamInfos.getState().x;
  const uiTypes = assembleUITypes(useUITypes.getState().x, false);
  const uiTypeCols = useParamInfos.getState().y;

  const kwargCols = useKwargCols.getState().x;
  const kwargInfo = assembleKwargInfosAndUserSpecifiedObjects(kwargCols);

  const sectionInfosState = useSectionInfos.getState();
  const sections: ManySectionTypeSaveProjectToBackend = _.mapValues(
    sectionInfosState.x,
    (x) => _.omit(x, ["parentId"])
  );

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
    projectConfigCodeInfoMaps,
  };
  // console.log(output);

  return output;
}

export async function saveProject() {
  const n = useNotification.getState();
  n.setMessage("Saving...");
  const x = assembleProject();
  const res = await dbSaveProject(x);
  if (res.status === 200) {
    n.setMessage("Saved!");
  }
}

export async function saveAsNewProjectConfig({ newConfigName }) {
  return await saveProjectAs({
    fn: saveAsNewProjectConfigDb,
    otherArgs: { newConfigName },
  });
}

export async function saveAsExistingProjectConfig({ configName }) {
  return await saveProjectAs({
    fn: saveAsExistingProjectConfigDb,
    otherArgs: { configName },
  });
}

async function saveProjectAs({ fn, otherArgs }) {
  const x = assembleProject();
  await fn({ ...x, ...otherArgs });
}

function assembleProject() {
  return { project: getProjectData() };
}

function assembleKwargInfosAndUserSpecifiedObjects(
  kwargCols: ManyKwargColType
) {
  // kwargs
  const kwargInfos: ManyCodeInfoType = {};
  const allCodeInfo = useCodeInfo.getState().allCodeInfo;
  for (const kwargCol of Object.values(kwargCols)) {
    for (const kwargIds of Object.values(kwargCol)) {
      for (const kwargId of kwargIds) {
        kwargInfos[kwargId] = allCodeInfo[kwargId];
      }
    }
  }

  // user specified objects
  const sections = useSectionInfos.getState().x;
  for (const s of Object.values(sections)) {
    if (s.userSpecifiedObjectId) {
      kwargInfos[s.userSpecifiedObjectId] =
        allCodeInfo[s.userSpecifiedObjectId];
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
