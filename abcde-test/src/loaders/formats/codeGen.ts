import _ from "lodash";

export function codeGen(loaded) {
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

  const codeInfo = {
    allCodeInfo: { ...allCodeInfo, ...kwargInfo },
  };
  return {
    project: processProject(project),
    sections: processSections(sections),
    codeInfo,
    uiTypes: { ...baseUITypes, ...uiTypes, ...presetUITypes },
    sectionCurrChildren,
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
