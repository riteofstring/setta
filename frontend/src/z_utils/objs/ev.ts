import _ from "lodash";
import { EVType } from "z_utils/types/evCol";
import { UITypeType } from "z_utils/types/uiType";
import { SLIDER, SWITCH, TEXT } from "../constants";

export function getValueForUIType({
  uiType,
  currValue,
}: {
  uiType: UITypeType;
  currValue?: string;
}) {
  switch (uiType.type) {
    case TEXT:
      return "";
    case SLIDER:
      return convertValueForSlider({ uiType, currValue });
    case SWITCH:
      return "false";
    default:
      return "";
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
      Math.min(Math.max(x, uiType.config.min), uiType.config.max),
    );
  }
  return uiType.config.min;
}
