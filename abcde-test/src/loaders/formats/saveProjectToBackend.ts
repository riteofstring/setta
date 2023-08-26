import {
  loadCodeInfoForProject,
  omitParentIdFromSections,
  processProject,
} from "./utils";

export function saveProjectToBackend(loaded) {
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

  const codeInfo = loadCodeInfoForProject(allCodeInfo, allUITypes);

  return {
    project: processProject(project),
    sections: omitParentIdFromSections(sections),
    uiTypes,
    codeInfo,
    ...theRest,
  };
}
