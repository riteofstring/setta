import _ from "lodash";
import { loadCodeInfoForProject, omitParentIdFromSections } from "./utils";

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

  const allUITypes = { ...baseUITypes, ...uiTypes, ...presetUITypes };

  const codeInfo = {
    allCodeInfo: {
      ...loadCodeInfoForProject(allCodeInfo, sections, allUITypes),
      ...kwargInfo,
    },
  };

  return {
    project: processProject(project),
    sections: omitParentIdFromSections(sections),
    codeInfo,
    uiTypes: allUITypes,
    ...theRest,
  };
}

function processProject(project) {
  return _.pick(project, ["id", "name"]);
}
