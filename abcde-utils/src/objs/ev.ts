import { SLIDER, SWITCH, TEXT } from "../constants";
import { EVType } from "../types/ev";
import { maybeNewId } from "../utils";

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
export function newEV({ id, uiType }): EVType {
  return {
    id: maybeNewId(id),
    value: getInitValueFromUIType(uiType),
    childId: null,
  };
}
