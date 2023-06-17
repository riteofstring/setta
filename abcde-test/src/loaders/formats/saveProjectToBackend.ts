import _ from "lodash";

export function saveProjectToBackend(loaded) {
  const {
    project,
    sections,
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
    project: processProject(project),
    sections: processSections(sections),
    kwargInfo,
    uiTypes,
    ...theRest,
  };
}

function processProject(project) {
  return _.pick(project, ["id", "name"]);
}

function processSections(sections) {
  return _.mapValues(sections, (x) =>
    _.pick(x, [
      "id",
      "name",
      "paramInfoId",
      "sectionChildrenId",
      "initialPosition",
      "size",
      "chainedFrom",
    ])
  );
}
