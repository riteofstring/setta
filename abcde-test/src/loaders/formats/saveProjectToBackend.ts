import { omitParentIdFromSections, processProject } from "./utils";

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
    ...theRest
  } = loaded;

  return {
    project: processProject(project),
    sections: omitParentIdFromSections(sections),
    kwargInfo: assembleKwargInfo(allCodeInfo, kwargInfo, sections),
    uiTypes,
    ...theRest,
  };
}

function assembleKwargInfo(allCodeInfo, kwargInfo, sections) {
  for (const s of Object.values(sections)) {
    if (s.userSpecifiedObjectId) {
      kwargInfo[s.userSpecifiedObjectId] = allCodeInfo[s.userSpecifiedObjectId];
    }
  }
  return kwargInfo;
}
