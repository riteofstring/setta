import baseUITypes from "__tests__data/BaseUITypes";
import globalDefaults from "__tests__data/GlobalDefaults";
import presetUITypes from "__tests__data/PresetUITypes";

export async function loadTestData(projectName = "simpleTrainTest") {
  const loaded = {};
  for (const k of [
    "codeInfo",
    "ev",
    "evCols",
    "kwargCols",
    "kwargInfo",
    "project",
    "projectConfig",
    "projectDefaults",
    "sectionChildren",
    "sectionChildrenIds",
    "sectionConfigCol",
    "sectionConfigs",
    "sections",
    "uiTypes",
    "uiTypesCols",
  ]) {
    try {
      loaded[k] = (
        await import(`../__tests__data/${projectName}/${k}`)
      ).default;
    } catch (e) {
      loaded[k] = {};
    }
  }

  const { project, projectConfig, codeInfo, kwargInfo, uiTypes, ...theRest } =
    loaded;

  const _project = {
    id: project.id,
    name: project.name,
    configId: projectConfig.id,
    sectionConfigColId: projectConfig.sectionConfigCol,
    childrenId: projectConfig.childrenId,
    children: projectConfig.children,
  };

  const _codeInfo = { ...codeInfo, ...kwargInfo };

  const _uiTypes = { ...baseUITypes, ...uiTypes, ...presetUITypes };

  return {
    project: _project,
    codeInfo: _codeInfo,
    globalDefaults,
    uiTypes: _uiTypes,
    ...theRest,
  };
}
