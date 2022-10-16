export async function loadTestData(projectName = "simpleTrainTest") {
  const loaded = {};
  const ext = ".ts";

  for (const k of ["baseUITypes", "globalDefaults", "presetUITypes"]) {
    try {
      loaded[k] = (await import(/* @vite-ignore */ `../__tests__data/${k}${ext}`)).default;
    } catch (e) {
      loaded[k] = {};
    }
  }

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
        await import(/* @vite-ignore */ `../__tests__data/${projectName}/${k}${ext}`)
      ).default;
    } catch (e) {
      loaded[k] = {};
    }
  }

  const {
    project,
    projectConfig,
    codeInfo,
    kwargInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    ...theRest
  } = loaded;

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
    uiTypes: _uiTypes,
    ...theRest,
  };
}
