import { CODE_INFOS, NON_PROJECT_STATES, PROJECT_STATES } from "./constants";

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

export async function loadProjectSpecificData({ projectName, subFolderName }) {
  const output = {};
  for (const k of PROJECT_STATES) {
    output[k] = await loadSpecificTestData({
      name: k,
      projectName,
      subFolderName,
    });
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

export async function loadOneProject({
  projectName = "simpleTrainTest",
  subFolderName = "simpleConfig1",
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
  loaded["allCodeInfo"] = await loadGlobalCodeInfo();

  return loaded;

  // const {
  //   allCodeInfo,
  //   kwargInfo,
  //   uiTypes,
  //   baseUITypes,
  //   presetUITypes,
  //   userCodeInfoMaps,
  //   sectionCurrChildren,
  //   ...theRest
  // } = loaded as any;

  // } else if (forCodeGen) {
  //   const codeInfo = {
  //     allCodeInfo: { ...allCodeInfo, ...kwargInfo },
  //   };
  //   return {
  //     codeInfo,
  //     uiTypes: { ...baseUITypes, ...uiTypes, ...presetUITypes },
  //     sectionCurrChildren,
  //     ...theRest,
  //   };
  // }
  // }
}
