import _ from "lodash";
import { loadCodeInfoForProject } from "./utils";

export function loadProjectToFrontend(loaded) {
  const {
    allCodeInfo,
    project,
    kwargInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    userCodeInfoMaps,
    sectionCurrChildren,
    ...theRest
  } = loaded;

  const allUITypes = { ...baseUITypes, ...uiTypes, ...presetUITypes };

  const codeInfo = {
    allCodeInfo: {
      ...loadCodeInfoForProject(allCodeInfo, allUITypes),
      ...kwargInfo,
    },
  };

  return {
    project: processProject(project),
    codeInfo,
    uiTypes: allUITypes,
    userCodeInfoMaps: userCodeInfoMaps[loaded.project.owner],
    ...theRest,
  };
}

function processProject(project) {
  return _.pick(project, ["id", "name"]);
}
