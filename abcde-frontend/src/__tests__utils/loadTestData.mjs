export async function loadTestData(projectName = "simpleTrainTest") {
  const loaded = {};

  for (const k of ["baseUITypes", "globalDefaults", "presetUITypes"]) {
    loaded[k] = await loadSpecificTestData({ name: k });
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
    loaded[k] = await loadSpecificTestData({ name: k, projectName });
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

export async function loadSpecificTestData({ name, projectName = "" }) {
  const ext = ".ts";

  try {
    return (
      await import(
        /* @vite-ignore */ `../__tests__data/${projectName}/${name}${ext}`
      )
    ).default;
  } catch (e) {
    return {};
  }
}
