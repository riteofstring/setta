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
    ...theRest
  } = loaded;

  const codeInfo = {
    allCodeInfo: { ...allCodeInfo, ...kwargInfo },
  };
  return {
    project: processProject(project),
    sections,
    codeInfo,
    uiTypes: { ...baseUITypes, ...uiTypes, ...presetUITypes },
    sectionCurrChildren: _.cloneDeep(_.pick(sections, ["children"])),
    ...theRest,
  };
}

function processProject(project) {
  return _.pick(project, ["id", "name"]);
}
