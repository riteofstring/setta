import _ from "lodash";
import { PROJECT_CONFIG_NAMES, PROJECT_NAMES } from "./constants";
import {
  IN_MEM_PROJECT_CONFIG_NAMES,
  IN_MEM_PROJECT_NAMES,
} from "./createInMem";
import { codeGen } from "./formats/codeGen";
import { loadProjectToFrontend } from "./formats/loadProjectToFrontend";
import { saveProjectToBackend } from "./formats/saveProjectToBackend";
import { seeding } from "./formats/seeding";
import {
  loadGlobalCodeInfo,
  loadGlobalData,
  loadProjectMetadata,
  loadProjectSpecificData,
} from "./helpers";

export async function loadTestData({ projectName, configName, format }) {
  // cloning avoids weird downstream mutation bugs that I don't fully understand...
  const loaded = _.cloneDeep(await _loadTestData({ projectName, configName }));

  switch (format) {
    case "loadProjectToFrontend":
      return loadProjectToFrontend(loaded);
    case "saveProjectToBackend":
      return saveProjectToBackend(loaded);
    case "codeGen":
      return codeGen(loaded);
    case "seeding":
      return seeding(loaded);
    default:
      return {};
  }
}

async function _loadTestData({ projectName, configName }) {
  const loaded = await loadProjectMetadata({
    projectName,
    configName,
  });

  Object.assign(loaded, await loadGlobalData());
  Object.assign(
    loaded,
    await loadProjectSpecificData({ projectName, configName })
  );
  loaded["allCodeInfo"] = await loadGlobalCodeInfo();

  return loaded;
}

export async function loadAllProjectMetadata() {
  let output: any[] = [];
  for (const p of [...PROJECT_NAMES, ...IN_MEM_PROJECT_NAMES]) {
    // @ts-ignore
    for (const configName of {
      ...PROJECT_CONFIG_NAMES,
      ...IN_MEM_PROJECT_CONFIG_NAMES,
    }[p]) {
      const loaded = await loadProjectMetadata({
        projectName: p,
        configName,
      });
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

export async function loadAllProjects(format) {
  const output: any[] = [];
  for (const p of PROJECT_NAMES) {
    for (const configName of PROJECT_CONFIG_NAMES[p]) {
      output.push(
        await loadTestData({
          projectName: p,
          configName,
          format,
        })
      );
    }
  }
  return output;
}
