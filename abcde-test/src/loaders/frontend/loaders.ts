import { DEFAULT_USER_ID, PROJECT_NAMES } from "../constants";
import { loadOneProject } from "../loaders";
import { loadInMemProject } from "./inMem";

export async function loadOneProjectFrontend({ projectName, configName }) {
  let loaded;
  if (PROJECT_NAMES.includes(projectName)) {
    loaded = await loadOneProject({
      projectName,
      subFolderName: configName,
    });
  } else {
    loaded = await loadInMemProject({
      projectName,
      configName: configName,
    });
  }

  return forFrontend(loaded);
}

function forFrontend(loaded) {
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
