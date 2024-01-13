import { ProjectLoadType } from "z_utils/types/projectSaveLoad";
import { useProjectConfigCodeInfoMaps } from "../models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "../models/codeInfoMaps/userCodeInfoMaps";
import { useCodeInfo } from "../models/info/codeInfo";
import { useOutputGroups } from "../models/info/outputGroups";
import { useOutputs } from "../models/info/outputs";
import { useParamInfos } from "../models/info/paramInfos";
import { useProject } from "../models/info/project";
import { useProjectConfig } from "../models/info/projectConfig";
import { useSectionInfos } from "../models/info/sectionInfos";
import { useUITypes } from "../models/info/uiTypes";
import { updateManyCurrChildren } from "./sections/children";
import { updateManyParamsAndCallables } from "./sections/sectionContents";
import { maybeIncrementProjectStateVersion } from "./undo";

export function loadProjectState({
  project,
  projectConfig,
  codeInfo,
  userCodeInfoMaps,
  projectConfigCodeInfoMaps,
  sections,
  evCols,
  uiTypes,
  uiTypeCols,
  outputs,
  outputGroups,
}: ProjectLoadType) {
  useCodeInfo.getState().resetAndSetAll(codeInfo);
  if (project) {
    useProject.getState().resetAndSetAll(project);
  }
  useProjectConfig.getState().resetAndSetAll(projectConfig);
  useUITypes.getState().resetAndSetAll(uiTypes);
  useParamInfos.getState().resetAndSetAll({ evCols, uiTypeCols });
  useUserCodeInfoMaps.getState().resetAndSetAll(userCodeInfoMaps);
  useProjectConfigCodeInfoMaps
    .getState()
    .resetAndSetAll(projectConfigCodeInfoMaps);
  useSectionInfos.getState().resetAndSetAll({ sections });
  useOutputs.getState().resetAndSetAll(outputs);
  useOutputGroups.getState().resetAndSetAll(outputGroups);
  updateManyParamsAndCallables(Object.keys(sections));
  updateManyCurrChildren(Object.keys(sections));
  maybeIncrementProjectStateVersion(true);
}
