import _ from "lodash";

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

  const codeInfo = {
    allCodeInfo: { ...allCodeInfo, ...kwargInfo },
  };
  return {
    project: processProject(project),
    codeInfo,
    uiTypes: { ...baseUITypes, ...uiTypes, ...presetUITypes },
    userCodeInfoMaps: userCodeInfoMaps[loaded.project.owner],
    ...theRest,
  };
}

function processProject(project) {
  return _.pick(project, ["id", "name"]);
}
