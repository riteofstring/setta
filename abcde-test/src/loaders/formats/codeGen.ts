import _ from "lodash";

export function codeGen(loaded) {
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

  const codeInfo = {
    allCodeInfo: { ...allCodeInfo, ...kwargInfo },
  };
  return {
    project: processProject(project),
    codeInfo,
    uiTypes: { ...baseUITypes, ...uiTypes, ...presetUITypes },
    sectionCurrChildren: _.cloneDeep(loaded.sectionChildren),
    ...theRest,
  };
}

function processProject(project) {
  return _.pick(project, ["id", "name"]);
}
