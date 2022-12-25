import { useProjectConfigCodeInfoMaps } from "./codeInfoMaps/projectConfigCodeInfoMaps";
import { useUserCodeInfoMaps } from "./codeInfoMaps/userCodeInfoMaps";
import { useCodeInfo } from "./info/codeInfo";
import { useEnteredValues } from "./info/enteredValues";
import { useObjInfos } from "./info/objInfos";
import { useParamInfos } from "./info/paramInfos";
import { useProject } from "./info/project";
import { useProjectConfig } from "./info/projectConfig";
import { useSectionConfigs } from "./info/sectionConfigs";
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
  ev,
  evCols,
  uiTypes,
  uiTypeCols,
  kwargCols,
  excludeCodeInfo,
}) {
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
  useObjInfos.getState().resetAndSetAll(kwargCols);
  useSectionInfos.getState().resetAndSetAll({
    sections,
    sectionConfigCol,
    sectionChildren,
  });
  useSectionConfigs.getState().resetAndSetAll(sectionConfigs);
}
