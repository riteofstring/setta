import { ProjectLoadType } from "abcde-utils/src/types/projectSaveLoad";
import { useProjectConfigCodeInfoMaps } from "../models/codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "../models/codeInfoMaps/userCodeInfoMaps";
import { useCodeInfo } from "../models/info/codeInfo";
import { useEnteredValues } from "../models/info/enteredValues";
import { useKwargCols } from "../models/info/kwargCols";
import { useOutputGroups } from "../models/info/outputGroups";
import { useOutputs } from "../models/info/outputs";
import { useParamInfos } from "../models/info/paramInfos";
import { useProject } from "../models/info/project";
import { useProjectConfig } from "../models/info/projectConfig";
import { useSectionDescription } from "../models/info/sectionDescription";
import { useSectionInfos } from "../models/info/sectionInfos";
import { useUITypes } from "../models/info/uiTypes";
import { maybeIncrementProjectStateVersion } from "./undo";

export function loadProjectState({
  project,
  projectConfig,
  codeInfo,
  userCodeInfoMaps,
  projectConfigCodeInfoMaps,
  sections,
  sectionChildren,
  sectionDescriptions,
  ev,
  evCols,
  uiTypes,
  uiTypeCols,
  kwargCols,
  outputs,
  outputGroups,
  excludeCodeInfo,
}: ProjectLoadType & { excludeCodeInfo: boolean }) {
  if (!excludeCodeInfo) {
    useCodeInfo.getState().resetAndSetAll(codeInfo);
  }
  useProject.getState().resetAndSetAll(project);
  useProjectConfig.getState().resetAndSetAll(projectConfig);
  useUITypes.getState().resetAndSetAll(uiTypes);
  useParamInfos.getState().resetAndSetAll({ evCols, uiTypeCols });
  useUserCodeInfoMaps.getState().resetAndSetAll(userCodeInfoMaps);
  useProjectConfigCodeInfoMaps
    .getState()
    .resetAndSetAll(projectConfigCodeInfoMaps);
  useEnteredValues.getState().resetAndSetAll(ev);
  useKwargCols.getState().resetAndSetAll(kwargCols);
  useSectionInfos.getState().resetAndSetAll({
    sections,
    sectionChildren,
  });
  useSectionDescription.getState().resetAndSetAll(sectionDescriptions);
  useOutputs.getState().resetAndSetAll(outputs);
  useOutputGroups.getState().resetAndSetAll(outputGroups);
  maybeIncrementProjectStateVersion(true);
}
