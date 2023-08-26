export function seeding(loaded) {
  const {
    allCodeInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    userCodeInfoMaps,
    ...theRest
  } = loaded as any;

  return {
    uiTypes: { ...uiTypes, ...presetUITypes },
    codeInfo: allCodeInfo,
    ...theRest,
  };
}
