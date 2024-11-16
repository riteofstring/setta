import C from "constants/constants.json";
import { getSectionVariantId } from "state/actions/sectionVariants";
import {
  useCodeInfo,
  useSectionInfos,
  useSectionVariants,
} from "state/definitions";
import { post } from "./utils";

export async function dbSectionToDict(sectionId, pinnedIds, unpinnedIds) {
  pinnedIds.requiredParamIds = Object.keys(pinnedIds.requiredParamIdsToPaths);
  unpinnedIds.requiredParamIds = Object.keys(
    unpinnedIds.requiredParamIdsToPaths,
  );
  delete pinnedIds.requiredParamIdsToPaths;
  delete unpinnedIds.requiredParamIdsToPaths;
  const { configLanguage } = useSectionInfos.getState().x[sectionId];
  const codeInfo = useCodeInfo.getState().x;
  const sectionVariant =
    useSectionVariants.getState().x[getSectionVariantId(sectionId).variantId];
  return await post({
    body: {
      codeInfo,
      sectionVariant,
      sectionId,
      pinnedIds,
      unpinnedIds,
      configLanguage,
    },
    address: C.ROUTE_SECTION_TO_DICT,
  });
}
