import { CODE_INFOS } from "./constants";

export async function loadGlobalData() {
  const output = {};
  for (const k of ["baseUITypes", "userCodeInfoMaps", "presetUITypes"]) {
    output[k] = await loadSpecificTestData({ name: k });
  }
  return output;
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
        /* @vite-ignore */ `../data/${projectName}/${subFolderName}/${name}${ext}`
      )
    ).default;
    return output;
  } catch (e) {
    return {};
  }
}

export async function loadProjectSpecificData({
  projectName,
  subFolderName,
  type = "inFile",
}) {
  const output = {};
  for (const k of [
    "ev",
    "evCols",
    "kwargCols",
    "kwargInfo",
    "projectConfigCodeInfoMaps",
    "sectionCurrChildren",
    "sectionChildren",
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

export async function loadGlobalCodeInfo() {
  const output: any = {};
  for (const k of CODE_INFOS) {
    Object.assign(
      output,
      await loadSpecificTestData({ name: k, projectName: "_codeInfo" })
    );
  }
  return output;
}
