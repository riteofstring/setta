import _ from "lodash";

type projectNamesType = { inFile: string[]; inMem: string[] };

const PROJECT_NAMES: projectNamesType = {
  inFile: [
    "simpleTrainTest",
    "appleOrchardFarm",
    "diffusionDrops",
    "pytorchLightningMnist",
    "pytorchTraining",
  ],
  inMem: [],
};
const PROJECT_CONFIG_NAMES = {
  simpleTrainTest: ["simpleConfig1"],
  appleOrchardFarm: ["appleConfig1"],
  diffusionDrops: ["diffusionConfig1", "diffusionConfig2"],
  pytorchLightningMnist: ["mnistConfig1"],
  pytorchTraining: ["config1"],
};
const IN_MEM_PROJECTS = {};
const IN_MEM_PROJECT_CONFIGS = {};
const DEFAULT_USER_ID = "25961114-6655-4e2c-b70f-e2e3aaa84131";

export async function loadGlobalData() {
  const output = {};
  for (const k of ["baseUITypes", "userCodeInfoMaps", "presetUITypes"]) {
    output[k] = await loadSpecificTestData({ name: k });
  }
  return output;
}

export async function loadProjectSpecificData({
  projectName,
  subFolderName,
  type = "inFile",
}) {
  const output = {};
  for (const k of [
    "allCodeInfo",
    "ev",
    "evCols",
    "kwargCols",
    "kwargInfo",
    "projectConfigCodeInfoMaps",
    "sectionCurrChildren",
    "sectionChildren",
    "sectionConfigCol",
    "sectionConfigs",
    "sectionDescriptions",
    "sections",
    "uiTypes",
    "uiTypeCols",
    "outputs",
    "outputGroups",
    "runs",
  ]) {
    if (type === "inFile") {
      output[k] = await loadSpecificTestData({
        name: k,
        projectName,
        subFolderName,
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
  forSavingToBackend = false,
  forCodeGen = false,
}) {
  const loaded = await loadOneProjectMetadata({
    projectName,
    subFolderName,
  });

  Object.assign(loaded, await loadGlobalData());
  Object.assign(
    loaded,
    await loadProjectSpecificData({ projectName, subFolderName })
  );

  const {
    allCodeInfo,
    kwargInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    userCodeInfoMaps,
    sectionCurrChildren,
    ...theRest
  } = loaded as any;

  if (forSavingToBackend) {
    // For saving a project, we don't need base uitypes
    return {
      kwargInfo,
      uiTypes: { ...uiTypes, ...presetUITypes },
      ...theRest,
    };
  } else if (forCodeGen) {
    const codeInfo = {
      allCodeInfo: { ...allCodeInfo, ...kwargInfo },
    };
    return {
      codeInfo,
      uiTypes: { ...baseUITypes, ...uiTypes, ...presetUITypes },
      sectionCurrChildren,
      ...theRest,
    };
  } else {
    // This means we're testing the frontend, so we need everything
    const codeInfo = {
      allCodeInfo: { ...allCodeInfo, ...kwargInfo },
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
}) {
  const ext = ".ts";

  try {
    const output = (
      await import(
        /* @vite-ignore */ `./data/${projectName}/${subFolderName}/${name}${ext}`
      )
    ).default;
    return output;
  } catch (e) {
    return {};
  }
}

export async function loadGlobalCodeInfo() {
  const output: any = {};
  for (const k of ["pytorch", "pytorchLightning", "pytorchLightningMnist"]) {
    Object.assign(
      output,
      await loadSpecificTestData({ name: k, projectName: "_codeInfo" })
    );
  }
  return output;
}

export async function loadAllProjects({ forSavingToBackend = false }) {
  const output: any[] = [];
  for (const type of ["inFile", "inMem"]) {
    for (const p of PROJECT_NAMES[type]) {
      for (const subFolderName of PROJECT_CONFIG_NAMES[p]) {
        output.push(
          await loadOneProject({
            projectName: p,
            subFolderName,
            forSavingToBackend,
          })
        );
      }
    }
  }
  return output;
}

export async function loadOneProjectMetadata({ projectName, subFolderName }) {
  const loaded = {};

  loaded["project"] = await loadSpecificTestData({
    name: "project",
    projectName,
  });
  loaded["projectConfig"] = await loadSpecificTestData({
    name: "projectConfig",
    projectName,
    subFolderName,
  });

  return loaded;
}

export async function loadAllProjectsMetadata() {
  let output: any[] = [];
  for (const type of ["inFile", "inMem"]) {
    for (const p of PROJECT_NAMES[type]) {
      for (const subFolderName of PROJECT_CONFIG_NAMES[p]) {
        let loaded;
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
  for (const [k, v] of Object.entries(output)) {
    output[k] = { ...v[0].project, configs: v.map((x) => x.projectConfig) };
  }
  return output;
}

export async function loadOneProjectByName({ projectName, configName }) {
  const projectMetaData = await loadAllProjectsMetadata();
  const project = _.find(projectMetaData, (x) => x.name === projectName);
  const projectConfig = project.configs.find((x) => x.name === configName);

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
  };

  const projectConfig = {
    id: fakeId,
    name: configName,
    sectionConfigCol: fakeId,
    childrenId: fakeId,
    children: [],
    isDefault: true,
  };

  IN_MEM_PROJECTS[name] = project;
  IN_MEM_PROJECT_CONFIGS[name] = { [configName]: projectConfig };

  return { ...project, configs: [projectConfig] };
}

async function loadInMemProject({ projectName, configName }) {
  const project = IN_MEM_PROJECTS[projectName];
  const projectConfig = IN_MEM_PROJECT_CONFIGS[projectName][configName];
  const loaded = { project, projectConfig };
  Object.assign(loaded, await loadGlobalData());
  Object.assign(
    loaded,
    await loadProjectSpecificData({
      projectName,
      subFolderName: configName,
      type: "inMem",
    })
  );
  return loaded;
}
