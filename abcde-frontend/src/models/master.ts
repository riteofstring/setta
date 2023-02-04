import { ProjectLoadType } from "abcde-utils/src/types/projectSaveLoad";
import { useProjectConfigCodeInfoMaps } from "./codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "./codeInfoMaps/userCodeInfoMaps";
import { useCodeInfo } from "./info/codeInfo";
import { useEnteredValues } from "./info/enteredValues";
import { useKwargCols } from "./info/kwargCols";
import { useOutputGroups } from "./info/outputGroups";
import { useOutputs } from "./info/outputs";
import { useParamInfos } from "./info/paramInfos";
import { useProject } from "./info/project";
import { useProjectConfig } from "./info/projectConfig";
import { useSectionConfigs } from "./info/sectionConfigs";
import { useSectionDescription } from "./info/sectionDescription";
import { useSectionInfos } from "./info/sectionInfos";
import { useUITypes } from "./info/uiTypes";

export function loadSections({
  project,
  projectConfig,
  codeInfo,
  userCodeInfoMaps,
  projectConfigCodeInfoMaps,
  sections,
  sectionConfigs,
  sectionConfigCol,
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
    sectionConfigCol,
    sectionChildren,
  });
  useSectionConfigs.getState().resetAndSetAll(sectionConfigs);
  useSectionDescription.getState().resetAndSetAll(sectionDescriptions);
  useOutputs.getState().resetAndSetAll(outputs);
  useOutputGroups.getState().resetAndSetAll(outputGroups);
}
