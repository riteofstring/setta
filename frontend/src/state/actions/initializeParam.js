import _ from "lodash";
import { newEVEntry } from "utils/objs/ev";
import { newUITypeColEntry } from "utils/objs/uiTypeCol";

// use inside of setState
export function initializeParams(sectionId, paramIds, x) {
  const { variantId, uiTypeColId } = x.x[sectionId];
  const uiTypeCol = x.uiTypeCols[uiTypeColId];
  for (const paramId of paramIds) {
    let uiTypeId = uiTypeCol[paramId]?.uiTypeId;
    if (!uiTypeId) {
      uiTypeCol[paramId] = newUITypeColEntry();
    }

    const sectionVariant = x.variants[variantId];
    const ev = sectionVariant.values[paramId];
    if (_.isNil(ev)) {
      sectionVariant.values[paramId] = newEVEntry(x.uiTypes[uiTypeId]);
    }
  }
}
