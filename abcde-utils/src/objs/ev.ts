import { SLIDER, SWITCH, TEXT } from "../constants";
import { EVType } from "../types/ev";

function getInitValueFromUIType(uiType) {
  switch (uiType) {
    case TEXT:
      return "";
    case SLIDER:
      return 0;
    case SWITCH:
      return false;
    default:
      return null;
  }
}

// Entered Value
export function newEV(uiType: string): EVType {
  return getInitValueFromUIType(uiType);
}
