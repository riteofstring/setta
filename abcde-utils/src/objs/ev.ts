import _ from "lodash";
import { UITypeType } from "src/types/uiType";
import { SLIDER, SWITCH, TEXT } from "../constants";
import { EVType } from "../types/ev";

export function getValueForUIType({
  uiType,
  currValue,
}: {
  uiType: UITypeType;
  currValue?: EVType;
}) {
  switch (uiType.type) {
    case TEXT:
      return "";
    case SLIDER:
      return convertValueForSlider({ uiType, currValue });
    case SWITCH:
      return false;
    default:
      return null;
  }
}

// Entered Value
export function newEV(uiType: UITypeType): EVType {
  return getValueForUIType({ uiType });
}

function convertValueForSlider({ uiType, currValue }) {
  const x = _.toNumber(currValue);
  if (_.isFinite(x)) {
    return _.toString(
      Math.min(Math.max(x, uiType.config.min), uiType.config.max)
    );
  }
  return uiType.config.min;
}
