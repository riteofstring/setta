import _ from "lodash";

const PROJECT_NAMES = {
  inFile: ["simpleTrainTest", "appleOrchardFarm", "diffusionDrops"],
  inMem: [],
};
const PROJECT_CONFIG_NAMES = {
  simpleTrainTest: ["simpleConfig1"],
  appleOrchardFarm: ["appleConfig1"],
  diffusionDrops: ["diffusionConfig1", "diffusionConfig2"],
};
const IN_MEM_PROJECTS = {};
const IN_MEM_PROJECT_CONFIGS = {};
const DEFAULT_USER_ID = "25961114-6655-4e2c-b70f-e2e3aaa84131";

export async function loadGlobalData({ forNode }) {
  const output = {};
  for (const k of ["baseUITypes", "userCodeInfoMaps", "presetUITypes"]) {
    output[k] = await loadSpecificTestData({ name: k, forNode });
  }
  return output;
}

export async function loadProjectSpecificData({
  projectName,
  subFolderName,
  forNode,
  type = "inFile",
}) {
  const output = {};
  for (const k of [
    "allCodeInfo",
    "allCollections",
    "callables",
    "params",
    "paramCollections",
    "ev",
    "evCols",
    "kwargCols",
    "kwargInfo",
    "projectCodeInfoMaps",
    "sectionChildren",
    "sectionConfigCol",
    "sectionConfigs",
    "sections",
    "uiTypes",
    "uiTypeCols",
  ]) {
    if (type === "inFile") {
      output[k] = await loadSpecificTestData({
        name: k,
        projectName,
        subFolderName,
        forNode,
      });
    } else {
      output[k] = {};
    }
  }
  return output;
}

export async function loadOneProject({
  projectName = "simpleTrainTest",
  subFolderName = "simpleConfig1",
  forNode = false,
  forSavingToBackend = false,
}) {
  const loaded = await loadOneProjectMetadata({
    projectName,
    subFolderName,
    forNode,
  });

  Object.assign(loaded, await loadGlobalData({ forNode }));
  Object.assign(
    loaded,
    await loadProjectSpecificData({ projectName, subFolderName, forNode })
  );

  const {
    allCodeInfo,
    allCollections,
    callables,
    params,
    paramCollections,
    kwargInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    userCodeInfoMaps,
    ...theRest
  } = loaded;

  if (forSavingToBackend) {
    // For saving a project, we don't need base uitypes
    return {
      kwargInfo,
      uiTypes: { ...uiTypes, ...presetUITypes },
      ...theRest,
    };
  } else {
    // This means we're testing the frontend, so we need everything
    const codeInfo = {
      allCodeInfo: { ...allCodeInfo, ...kwargInfo },
      allCollections,
      callables,
      params,
      paramCollections,
    };
    return {
      codeInfo,
      uiTypes: { ...baseUITypes, ...uiTypes, ...presetUITypes },
      userCodeInfoMaps: userCodeInfoMaps[DEFAULT_USER_ID],
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

export async function loadAllProjects({
  forNode = false,
  forSavingToBackend = false,
}) {
  const output = [];
  for (const type of ["inFile", "inMem"]) {
    for (const p of PROJECT_NAMES[type]) {
      for (const subFolderName of PROJECT_CONFIG_NAMES[p]) {
        output.push(
          await loadOneProject({
            projectName: p,
            subFolderName,
            forNode,
            forSavingToBackend,
          })
        );
      }
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
  for (const type of ["inFile", "inMem"]) {
    for (const p of PROJECT_NAMES[type]) {
      for (const subFolderName of PROJECT_CONFIG_NAMES[p]) {
        let loaded = null;
        if (type === "inFile") {
          loaded = await loadOneProjectMetadata({
            projectName: p,
            subFolderName,
          });
        } else {
          loaded = await loadInMemProject({
            projectName: p,
            configName: subFolderName,
          });
        }
        output.push(loaded);
      }
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

export async function loadOneProjectById({ id, configId }) {
  const projectMetaData = await loadAllProjectsMetadata();
  const project = _.filter(projectMetaData, (x) => x.id === id)[0];
  const projectConfig = project.configs.filter((x) => x.id === configId)[0];

  if (PROJECT_NAMES["inFile"].includes(project.name)) {
    return await loadOneProject({
      projectName: project.name,
      subFolderName: projectConfig.name,
    });
  } else {
    return await loadInMemProject({
      projectName: project.name,
      configName: projectConfig.name,
    });
  }
}

export function createInMemProject(name) {
  const configName = "config1";

  PROJECT_NAMES["inMem"].push(name);
  PROJECT_CONFIG_NAMES[name] = [configName];
  const fakeId = "12345";

  const project = {
    id: fakeId,
    name,
    defaultConfigId: fakeId,
  };

  const projectConfig = {
    id: project.defaultConfigId,
    name: configName,
    sectionConfigCol: fakeId,
    childrenId: fakeId,
    children: [],
  };

  IN_MEM_PROJECTS[name] = project;
  IN_MEM_PROJECT_CONFIGS[name] = { [configName]: projectConfig };

  return { ...project, configs: [projectConfig] };
}

async function loadInMemProject({ projectName, configName }) {
  const project = IN_MEM_PROJECTS[projectName];
  const projectConfig = IN_MEM_PROJECT_CONFIGS[projectName][configName];
  const loaded = { project, projectConfig };
  Object.assign(loaded, await loadGlobalData({ forNode: false }));
  Object.assign(
    loaded,
    await loadProjectSpecificData({
      projectName,
      subFolderName: configName,
      forNode: false,
      type: "inMem",
    })
  );
  return loaded;
}
