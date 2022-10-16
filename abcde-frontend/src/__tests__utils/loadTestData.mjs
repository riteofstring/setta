export async function loadOneProject({
  projectName = "simpleTrainTest",
  subFolderName = "simpleConfig1",
  forBackend = false,
}) {
  const loaded = {};

  for (const k of ["baseUITypes", "globalDefaults", "presetUITypes"]) {
    loaded[k] = await loadSpecificTestData({ name: k, forBackend });
  }

  loaded["project"] = await loadSpecificTestData({
    name: "project",
    projectName,
    forBackend,
  });

  for (const k of [
    "codeInfo",
    "ev",
    "evCols",
    "kwargCols",
    "kwargInfo",
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
      subFolderName,
      forBackend,
    });
  }

  const {
    codeInfo,
    kwargInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    ...theRest
  } = loaded;

  const _codeInfo = { ...codeInfo, ...kwargInfo };
  const _uiTypes = { ...baseUITypes, ...uiTypes, ...presetUITypes };

  // When sending to the backend, we send just kwargInfo
  // instead of both kwargInfo and codeInfo
  if (forBackend) {
    return {
      kwargInfo,
      uiTypes: _uiTypes,
      ...theRest,
    };
  } else {
    return {
      codeInfo: _codeInfo,
      uiTypes: _uiTypes,
      ...theRest,
    };
  }
}

export async function loadSpecificTestData({
  name,
  projectName = "",
  subFolderName = "",
  forBackend = false,
}) {
  const ext = ".ts";

  try {
    const output = (
      await import(
        /* @vite-ignore */ `../__tests__data/${projectName}/${subFolderName}/${name}${ext}`
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
    const subFolderName = projectSubFolderNames(p);
    output.push(
      await loadOneProject({ projectName: p, subFolderName, forBackend })
    );
  }
  return output;
}

function projectSubFolderNames(projectName) {
  return {
    simpleTrainTest: ["simpleConfig1"],
    appleOrchardFarm: ["appleConfig1"],
    diffusionDrops: ["diffusionConfig1"],
  }[projectName];
}
