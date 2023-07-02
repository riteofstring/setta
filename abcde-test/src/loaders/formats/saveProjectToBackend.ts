import _ from "lodash";

export function saveProjectToBackend(loaded) {
  const {
    project,
    allCodeInfo,
    kwargInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    userCodeInfoMaps,
    ...theRest
  } = loaded;

  return {
    project: processProject(project),
    kwargInfo,
    uiTypes,
    ...theRest,
  };
}

function processProject(project) {
  return _.pick(project, ["id", "name", "defaultConfigId"]);
}
