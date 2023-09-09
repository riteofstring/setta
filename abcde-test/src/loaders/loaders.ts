import _ from "lodash";
import { PROJECT_CONFIG_NAMES, PROJECT_NAMES } from "./constants";
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
