export function seeding(loaded) {
  const {
    allCodeInfo,
    kwargInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    userCodeInfoMaps,
    sectionCurrChildren,
    ...theRest
  } = loaded as any;

  return {
    kwargInfo,
    uiTypes: { ...uiTypes, ...presetUITypes },
    ...theRest,
  };
}
