import _ from "lodash";
import {
  getDisplayedSectionVariantId,
  getSectionType,
  getSectionVariant,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { C } from "utils/c";
import { useGetSectionVariantNames } from "./sectionVariants";

export function useParamSweepInfo(sectionId) {
  return useProjectState((x) => {
    const displayedVariantId = getDisplayedSectionVariantId(sectionId, x);
    const forSectionId = getForSectionId(sectionId, x.sections);
    return {
      forSectionId,
      variantId: displayedVariantId,
      paramSweep: x.variants[displayedVariantId].sweep,
      variantIsFrozen: getSectionVariant(sectionId).isFrozen,
      showParamSweepSectionSearch:
        !x.sections[forSectionId].hideSearch &&
        getSectionType(forSectionId, x) !== C.GLOBAL_VARIABLES,
    };
  }, _.isEqual);
}

export function useGetParamSweepNames(sectionId) {
  const paramSweepSectionId = useProjectState(
    (x) => x.sections[sectionId].paramSweepSectionId,
  );
  return useGetSectionVariantNames(paramSweepSectionId);
}

export function getForSectionId(sectionId, sectionState) {
  return Object.values(sectionState).find(
    (s) => s.paramSweepSectionId === sectionId,
  )?.id;
}
