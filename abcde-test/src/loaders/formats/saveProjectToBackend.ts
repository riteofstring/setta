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
  return _.pick(project, ["id", "name", "defaultConfigId"]);
}

function processSections(sections) {
  return _.mapValues(sections, (x) =>
    _.pick(x, [
      "id",
      "name",
      "paramInfoId",
      "initialPosition",
      "size",
      "chainedFrom",
      "zIndex",
      "uiTypeId",
      "evColId",
      "kwargColId",
      "uiTypeColId",
      "selectedItem",
      "descriptionId",
    ])
  );
}
