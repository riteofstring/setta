import C from "constants/constants.json";
import _ from "lodash";

export function getValueForUIType({ uiType, currValue }) {
  switch (uiType.type) {
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
    return _.toString(
      Math.min(Math.max(x, uiType.config.min), uiType.config.max),
    );
  }
  return uiType.config.min;
}

function convertValueForSwitch({ currValue }) {
  if (!_.isNil(currValue)) {
    return currValue === "0" ? "false" : "true";
  }
  return "false";
}
