import { DECK } from "./constants";
import { PresetType } from "./types/uiType";

export function isBasePreset(uiType) {
  return uiType.presetType === PresetType.BASE && uiType.type !== DECK;
}

export function isUserPreset(uiType) {
  return uiType.presetType === PresetType.USER && uiType.type !== DECK;
}

export function isPreset(uiType) {
  return isBasePreset(uiType) || isUserPreset(uiType);
}
