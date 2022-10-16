export async function loadOneProject({
  projectName = "simpleTrainTest",
  forBackend = false,
}) {
  const loaded = {};

  for (const k of ["baseUITypes", "globalDefaults", "presetUITypes"]) {
    loaded[k] = await loadSpecificTestData({ name: k, forBackend });
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
    loaded[k] = await loadSpecificTestData({
      name: k,
      projectName,
      forBackend,
    });
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

  // When sending to the backend, we send just kwargInfo
  // instead of both kwargInfo and codeInfo
  if (forBackend) {
    return {
      project: _project,
      kwargInfo,
      uiTypes: _uiTypes,
      ...theRest,
    };
  } else {
    return {
      project: _project,
      codeInfo: _codeInfo,
      uiTypes: _uiTypes,
      ...theRest,
    };
  }
}

export async function loadSpecificTestData({
  name,
  projectName = "",
  forBackend = false,
}) {
  const ext = ".ts";

  try {
    const output = (
      await import(
        /* @vite-ignore */ `../__tests__data/${projectName}/${name}${ext}`
      )
    ).default;
    return forBackend ? output.default : output;
  } catch (e) {
    return {};
  }
}

export async function loadAllProjects({ forBackend = false }) {
  const projectNames = [
    "simpleTrainTest",
    "appleOrchardFarm",
    "diffusionDrops",
  ];
  const output = [];
  for (const p of projectNames) {
    output.push(await loadOneProject({ projectName: p, forBackend }));
  }
  return output;
}
