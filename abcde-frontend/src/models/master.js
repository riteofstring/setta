import { thunk } from "easy-peasy";
import { useEnteredValues } from "./info/enteredValues";
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
      a.codeInfo.resetAndSetAll(codeInfo);
    }
    useProject.getState().resetAndSetAll(project);
    useProjectConfig.getState().resetAndSetAll(projectConfig);
    a.uiTypes.resetAndSetAll(uiTypes);
    a.paramInfos.resetAndSetAll({ evCols, uiTypeCols });
    a.userCodeInfoMaps.resetAndSetAll(userCodeInfoMaps);
    a.projectConfigCodeInfoMaps.resetAndSetAll(projectConfigCodeInfoMaps);
    useEnteredValues.getState().resetAndSetAll(ev);
    a.objInfos.resetAndSetAll(kwargCols);
    a.sectionInfos.resetAndSetAll({
      sections,
      sectionConfigCol,
      sectionChildren,
    });
    useSectionConfigs.getState().resetAndSetAll(sectionConfigs);
  }),
};

export default master;
