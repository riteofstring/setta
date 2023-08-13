import {
  CODE_INFOS,
  NON_PROJECT_STATES,
  PROJECT_NAMES,
  PROJECT_STATES,
} from "./constants";

export async function loadGlobalData() {
  const output = {};
  for (const k of NON_PROJECT_STATES) {
    output[k] = await loadSpecificTestData({ name: k });
  }
  return output;
}

export async function loadSpecificTestData({
  name,
  projectName = "",
  configName = "",
}) {
  const ext = ".ts";

  try {
    const output = (
      await import(
        /* @vite-ignore */ `../data/${projectName}/${configName}/${name}${ext}`
      )
    ).default;
    return output;
  } catch (e) {
    return {};
  }
}

export async function loadProjectSpecificData({ projectName, configName }) {
  const output = {};
  for (const k of PROJECT_STATES) {
    output[k] = await loadSpecificTestData({
      name: k,
      projectName,
      configName,
    });
  }
  return output;
}

export async function loadProjectMetadata({ projectName, configName }) {
  const loaded = {};

  if (PROJECT_NAMES.includes(projectName)) {
    loaded["project"] = await loadSpecificTestData({
      name: "project",
      projectName,
    });
    loaded["projectConfig"] = await loadSpecificTestData({
      name: "projectConfig",
      projectName,
      configName,
    });
  }

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
