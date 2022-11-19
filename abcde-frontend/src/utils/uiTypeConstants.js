import { DECK } from "./constants";

export const BASE = "base";
export const USER = "user";

export function isBasePreset(uiType) {
  return uiType.presetType === BASE && uiType.type !== DECK;
}

export function isUserPreset(uiType) {
  return uiType.presetType === USER && uiType.type !== DECK;
}

export function isPreset(uiType) {
  return isBasePreset(uiType) || isUserPreset(uiType);
}
