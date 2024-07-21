export const PresetType = {
  BASE: "BASE",
  USER: "USER",
};

export function isBasePreset(uiType) {
  return uiType.presetType === PresetType.BASE;
}

export function isUserPreset(uiType) {
  return uiType.presetType === PresetType.USER;
}

export function isPreset(uiType) {
  return isBasePreset(uiType) || isUserPreset(uiType);
}
