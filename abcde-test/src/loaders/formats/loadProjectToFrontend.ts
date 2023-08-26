import { loadCodeInfoForProject, processProject } from "./utils";

export function loadProjectToFrontend(loaded) {
  const {
    allCodeInfo,
    project,
    sections,
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
    codeInfo,
    sections,
    uiTypes: allUITypes,
    userCodeInfoMaps: userCodeInfoMaps[loaded.project.owner],
    ...theRest,
  };
}
