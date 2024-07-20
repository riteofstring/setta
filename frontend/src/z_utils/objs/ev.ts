import C from "constants/constants.json";
import _ from "lodash";
import { EVType } from "z_utils/types/evCol";
import { UITypeType } from "z_utils/types/uiType";

export function getValueForUIType({
  uiType,
  currValue,
}: {
  uiType: UITypeType;
  currValue?: string;
}) {
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
