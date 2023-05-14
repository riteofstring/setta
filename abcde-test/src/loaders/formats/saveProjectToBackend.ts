export function saveProjectToBackend(loaded) {
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

  return {
    kwargInfo,
    uiTypes: { ...uiTypes, ...presetUITypes },
    ...theRest,
  };
}
