export function seeding(loaded) {
  const {
    allCodeInfo,
    kwargInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    userCodeInfoMaps,
    ...theRest
  } = loaded as any;

  return {
    kwargInfo,
    uiTypes: { ...uiTypes, ...presetUITypes },
    ...theRest,
  };
}
