import _ from "lodash";
import { PROJECT_CONFIG_NAMES, PROJECT_NAMES } from "../constants";
import { loadOneProjectMetadata } from "../loaders";
import {
  IN_MEM_PROJECT_CONFIG_NAMES,
  IN_MEM_PROJECT_NAMES,
  loadInMemProject,
} from "./inMem";

export async function loadAllProjectsMetadata() {
  let output: any[] = [];
  for (const p of [...PROJECT_NAMES, ...IN_MEM_PROJECT_NAMES]) {
    for (const subFolderName of {
      ...PROJECT_CONFIG_NAMES,
      ...IN_MEM_PROJECT_CONFIG_NAMES,
    }[p]) {
      let loaded;
      if (PROJECT_NAMES.includes(p)) {
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

  // groupby project id, and put configs into a list for each project
  output = _.groupBy(output, (v) => v.project.id);
  for (const [k, v] of Object.entries(output)) {
    output[k] = { ...v[0].project, configs: v.map((x) => x.projectConfig) };
  }
  return output;
}
