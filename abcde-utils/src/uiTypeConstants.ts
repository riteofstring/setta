import { DECK } from "./constants";
import { PresetType } from "./types/uiType";

export function isBasePreset(uiType) {
  return uiType.presetType === PresetType.BASE;
}

export function isUserPreset(uiType) {
  return uiType.presetType === PresetType.USER;
}

export function isNotDeck(uiType) {
  return uiType.type !== DECK;
}

export function isPreset(uiType) {
  return isBasePreset(uiType) || isUserPreset(uiType);
}
