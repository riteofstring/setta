import _ from "lodash";
import {
  DEFAULT_USER_ID,
  PROJECT_CONFIG_NAMES,
  PROJECT_NAMES,
} from "../constants";
import {
  loadGlobalCodeInfo,
  loadGlobalData,
  loadOneProjectMetadata,
  loadProjectSpecificData,
} from "../loaders";
import { loadInMemProject } from "./inMem";

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
  loaded["allCodeInfo"] = await loadGlobalCodeInfo();

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

export async function loadAllProjectsMetadata() {
  let output: any[] = [];
  for (const p of PROJECT_NAMES) {
    for (const subFolderName of PROJECT_CONFIG_NAMES[p]) {
      let loaded;
      // if (type === "inFile") {
      loaded = await loadOneProjectMetadata({
        projectName: p,
        subFolderName,
      });
      // } else {
      //   loaded = await loadInMemProject({
      //     projectName: p,
      //     configName: subFolderName,
      //   });
      // }
      output.push(loaded);
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
  if (PROJECT_NAMES.includes(projectName)) {
    return await loadOneProject({
      projectName,
      subFolderName: configName,
    });
  } else {
    return await loadInMemProject({
      projectName,
      configName: configName,
    });
  }
}
