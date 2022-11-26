import { thunk } from "easy-peasy";
import { exportSelected } from "utils/exportSelected";

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
    a.project.resetAndSetAll(project);
    a.projectConfig.resetAndSetAll(projectConfig);
    a.uiTypes.resetAndSetAll(uiTypes);
    a.paramInfos.resetAndSetAll({ evCols, uiTypeCols });
    a.userCodeInfoMaps.resetAndSetAll(userCodeInfoMaps);
    a.projectConfigCodeInfoMaps.resetAndSetAll(projectConfigCodeInfoMaps);
    a.enteredValues.resetAndSetAll(ev);
    a.objInfos.resetAndSetAll(kwargCols);
    a.sectionInfos.resetAndSetAll({
      sections,
      sectionConfigCol,
      sectionChildren,
      topLevelIds: projectConfig.children,
    });
    a.sectionConfigs.resetAndSetAll(sectionConfigs);
  }),

  exportSelected: thunk((action, payload, helpers) => {
    return exportSelected(helpers.getStoreState());
  }),
};

export default master;
