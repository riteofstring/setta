import { DEFAULT_USER_ID } from "../constants";

export function loadProjectToFrontend(loaded) {
  const {
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
    codeInfo,
    uiTypes: { ...baseUITypes, ...uiTypes, ...presetUITypes },
    userCodeInfoMaps: userCodeInfoMaps[DEFAULT_USER_ID],
    ...theRest,
  };
}
