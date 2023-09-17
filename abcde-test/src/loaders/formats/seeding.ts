export function seeding(loaded) {
  const {
    codeInfo,
    uiTypes,
    baseUITypes,
    presetUITypes,
    userCodeInfoMaps,
    ...theRest
  } = loaded as any;

  return {
    uiTypes: { ...uiTypes, ...presetUITypes },
    codeInfo,
    ...theRest,
  };
}
