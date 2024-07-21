import C from "constants/constants.json";
import _ from "lodash";

export function getValueForUIType({ uiType, currValue }) {
  switch (uiType.type) {
    case C.TEXT:
      return "";
    case C.SLIDER:
      return convertValueForSlider({ uiType, currValue });
    case C.SWITCH:
      return "false";
    default:
      return "";
  }
}

// Entered Value
export function newEV(uiType) {
  return getValueForUIType({ uiType });
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
