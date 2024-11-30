import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { findAllParameters } from "utils/getDescendants";
import { getSectionCodeInfoChildren } from "./codeInfoCols";
import { initEnteredValue } from "./sectionVariants";

export function initializeChildParams({ sectionIds, codeInfoIds }) {
  for (const s of sectionIds) {
    const { ids: paramIds } = findAllParameters(
      useSectionInfos.getState().codeInfo,
      getSectionCodeInfoChildren(s),
      codeInfoIds,
    );
    initializeParams(s, paramIds);
  }
}

export function initializeParams(sectionId, paramIds) {
  useSectionInfos.setState((x) => {
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
  });
}
