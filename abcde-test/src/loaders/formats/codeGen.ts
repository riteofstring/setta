import _ from "lodash";
import { loadCodeInfoForProject, omitParentIdFromSections } from "./utils";

export function codeGen(loaded) {
  const {
    project,
    sections,
    allCodeInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    userCodeInfoMaps,
    ...theRest
  } = loaded;

  const allUITypes = { ...baseUITypes, ...uiTypes, ...presetUITypes };

  const codeInfo = loadCodeInfoForProject(allCodeInfo, sections, allUITypes);

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
