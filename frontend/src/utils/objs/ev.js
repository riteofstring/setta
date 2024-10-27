import C from "constants/constants.json";
import _ from "lodash";
import { clamp } from "utils/utils";

export function getValueForUIType({ uiType, currValue }) {
  switch (uiType.type) {
    case C.ONE_LINE_CODE:
    case C.TEXT:
      return convertValueForText({ currValue });
    case C.SLIDER:
      return convertValueForSlider({ uiType, currValue });
    case C.SWITCH:
      return convertValueForSwitch({ currValue });
    default:
      return "";
  }
}

// Entered Value
export function newEV(uiType) {
  return getValueForUIType({ uiType });
}

function convertValueForText({ currValue }) {
  if (!_.isNil(currValue)) {
    return currValue;
  }
  return "";
}

function convertValueForSlider({ uiType, currValue }) {
  const x = _.toNumber(currValue);
  if (_.isFinite(x)) {
    return _.toString(clamp(x, uiType.config.min, uiType.config.max));
  }
  return _.toString(uiType.config.min);
}

function convertValueForSwitch({ currValue }) {
  if (!_.isNil(currValue)) {
    return currValue === "0" ? "false" : "true";
  }
  return "false";
}
