import _ from "lodash";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { initEnteredValue } from "./sectionVariants";

// use inside of setState
export function initializeParams(sectionId, paramIds, x) {
  const { variantId, uiTypeColId } = x.x[sectionId];
  const uiTypeCol = x.uiTypeCols[uiTypeColId];
  for (const paramId of paramIds) {
    let uiTypeId = uiTypeCol[paramId]?.uiTypeId;
    if (!uiTypeId) {
      uiTypeId = BASE_UI_TYPE_IDS.TEXT;
      uiTypeCol[paramId] = { uiTypeId, nonPresetUITypeIds: [] };
    }

    const sectionVariant = x.variants[variantId];
    const ev = sectionVariant.values[paramId];
    if (_.isNil(ev)) {
      sectionVariant.values[paramId] = initEnteredValue(x.uiTypes[uiTypeId]);
    }
  }
}
