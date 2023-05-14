import { PROJECT_CONFIG_NAMES, PROJECT_NAMES } from "../constants";
import { loadOneProject } from "../loaders";

export async function loadAllProjects() {
  const output: any[] = [];
  for (const p of PROJECT_NAMES) {
    for (const subFolderName of PROJECT_CONFIG_NAMES[p]) {
      const loaded = await loadOneProject({
        projectName: p,
        subFolderName,
      });
      output.push(forBackend(loaded));
    }
  }
  return output;
}

function forBackend(loaded) {
  const {
    allCodeInfo,
    kwargInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    userCodeInfoMaps,
    sectionCurrChildren,
    ...theRest
  } = loaded;

  return {
    kwargInfo,
    uiTypes: { ...uiTypes, ...presetUITypes },
    ...theRest,
  };
}
