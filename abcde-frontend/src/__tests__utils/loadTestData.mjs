import _ from "lodash";

export async function loadOneProject({
  projectName = "simpleTrainTest",
  subFolderName = "simpleConfig1",
  forNode = false,
  forSeeding = false,
  forSavingToBackend = false,
}) {
  const loaded = await loadOneProjectMetadata({
    projectName,
    subFolderName,
    forNode,
  });

  for (const k of ["baseUITypes", "globalDefaults", "presetUITypes"]) {
    loaded[k] = await loadSpecificTestData({ name: k, forNode });
  }

  for (const k of [
    "codeInfo",
    "ev",
    "evCols",
    "kwargCols",
    "kwargInfo",
    "projectDefaults",
    "sectionChildren",
    "sectionConfigCol",
    "sectionConfigs",
    "sections",
    "uiTypes",
    "uiTypeCols",
  ]) {
    loaded[k] = await loadSpecificTestData({
      name: k,
      projectName,
      subFolderName,
      forNode,
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

  const _uiTypes = { ...baseUITypes, ...uiTypes, ...presetUITypes };

  if (forSeeding) {
    // For seeding a project we need kwargInfo
    // instead of both kwargInfo and codeInfo
    return {
      kwargInfo,
      uiTypes: _uiTypes,
      ...theRest,
    };
  } else if (forSavingToBackend) {
    // For saving a project, we don't need preset or base uitypes
    return {
      kwargInfo,
      uiTypes,
      ...theRest,
    };
  } else {
    // This means we're testing the frontend, so we need everything
    const _codeInfo = { ...codeInfo, ...kwargInfo };
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
  forNode = false,
}) {
  const ext = ".ts";

  try {
    const output = (
      await import(
        /* @vite-ignore */ `../__tests__data/${projectName}/${subFolderName}/${name}${ext}`
      )
    ).default;
    return forNode ? output.default : output;
  } catch (e) {
    return {};
  }
}

export async function loadAllProjects({ forNode = false, forSeeding = false }) {
  const output = [];
  for (const p of projectNames()) {
    for (const subFolderName of projectSubFolderNames(p)) {
      output.push(
        await loadOneProject({
          projectName: p,
          subFolderName,
          forNode,
          forSeeding,
        })
      );
    }
  }
  return output;
}

export async function loadOneProjectMetadata({
  projectName,
  subFolderName,
  forNode,
}) {
  const loaded = {};

  loaded["project"] = await loadSpecificTestData({
    name: "project",
    projectName,
    forNode,
  });
  loaded["projectConfig"] = await loadSpecificTestData({
    name: "projectConfig",
    projectName,
    subFolderName,
    forNode,
  });

  return loaded;
}

export async function loadAllProjectsMetadata() {
  let output = [];
  for (const p of projectNames()) {
    for (const subFolderName of projectSubFolderNames(p)) {
      const loaded = await loadOneProjectMetadata({
        projectName: p,
        subFolderName,
      });
      output.push(loaded);
    }
  }

  // groupby project id, and put configs into a list for each project
  output = _.groupBy(output, (v) => v.project.id);
  for (const k of _.keys(output)) {
    const v = output[k];
    output[k] = { ...v[0].project, configs: v.map((x) => x.projectConfig) };
  }
  return output;
}

function projectNames() {
  return ["simpleTrainTest", "appleOrchardFarm", "diffusionDrops"];
}

function projectSubFolderNames(projectName) {
  return {
    simpleTrainTest: ["simpleConfig1"],
    appleOrchardFarm: ["appleConfig1"],
    diffusionDrops: ["diffusionConfig1", "diffusionConfig2"],
  }[projectName];
}

export async function loadOneProjectById({ projectId, projectConfigId }) {
  const projectMetaData = await loadAllProjectsMetadata();
  const project = _.filter(projectMetaData, (x) => x.id === projectId)[0];
  const projectConfig = project.configs.filter(
    (x) => x.id === projectConfigId
  )[0];

  return await loadOneProject({
    projectName: project.name,
    subFolderName: projectConfig.name,
  });
}
