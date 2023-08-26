import { omitParentIdFromSections, processProject } from "./utils";

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

  return {
    project: processProject(project),
    sections: omitParentIdFromSections(sections),
    uiTypes,
    ...theRest,
  };
}
