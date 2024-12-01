import { getDisplayedSectionVariantId } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { useGetSectionVariantNames } from "./sectionVariants";

export function useParamSweepInfo(sectionId) {
  return useSectionInfos((x) => {
    const forSectionId = getForSectionId(x.x, sectionId);
    const variantId = getDisplayedSectionVariantId(sectionId, x);
    const paramSweep = x.variants[variantId].sweep;
    return {
      forSectionId,
      variantId,
      paramSweep,
    };
  });
}

export function useGetParamSweepNames(sectionId) {
  const paramSweepSectionId = useSectionInfos(
    (x) => x.x[sectionId].paramSweepSectionId,
  );
  return useGetSectionVariantNames(paramSweepSectionId);
}

export function getForSectionId(state, sectionId) {
  return Object.values(state).find((s) => s.paramSweepSectionId === sectionId)
    ?.id;
}
