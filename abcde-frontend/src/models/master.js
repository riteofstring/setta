import { thunk } from "easy-peasy";
import { useCodeInfo } from "./info/codeInfo";
import { useEnteredValues } from "./info/enteredValues";
import { useObjInfos } from "./info/objInfos";
import { useParamInfos } from "./info/paramInfos";
import { useProject } from "./info/project";
import { useProjectConfig } from "./info/projectConfig";
import { useSectionConfigs } from "./info/sectionConfigs";

const master = {
  loadSections: thunk((action, payload, helpers) => {
    const {
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
    } = payload;

    const a = helpers.getStoreActions();
    if (!excludeCodeInfo) {
      useCodeInfo.getState().resetAndSetAll(codeInfo);
    }
    useProject.getState().resetAndSetAll(project);
    useProjectConfig.getState().resetAndSetAll(projectConfig);
    a.uiTypes.resetAndSetAll(uiTypes);
    useParamInfos.getState().resetAndSetAll({ evCols, uiTypeCols });
    a.userCodeInfoMaps.resetAndSetAll(userCodeInfoMaps);
    a.projectConfigCodeInfoMaps.resetAndSetAll(projectConfigCodeInfoMaps);
    useEnteredValues.getState().resetAndSetAll(ev);
    useObjInfos.getState().resetAndSetAll(kwargCols);
    a.sectionInfos.resetAndSetAll({
      sections,
      sectionConfigCol,
      sectionChildren,
    });
    useSectionConfigs.getState().resetAndSetAll(sectionConfigs);
  }),
};

export default master;
