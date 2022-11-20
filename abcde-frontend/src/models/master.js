import { thunk } from "easy-peasy";
import { exportSelected } from "utils/exportSelected";

const master = {
  loadSections: thunk((action, payload, helpers) => {
    const {
      project,
      projectConfig,
      codeInfo,
      globalDefaults,
      projectDefaults,
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
    a.globalParamDefaults.resetAndSetAll(globalDefaults.paramDefaults);
    a.projectParamDefaults.resetAndSetAll(projectDefaults.paramDefaults);
    a.enteredValues.resetAndSetAll(ev);
    a.objInfos.setAllKwargIds({ ...kwargCols });
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
