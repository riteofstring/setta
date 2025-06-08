import {
  getCodeChildrenAndParentCodeInfoId,
  getSectionType,
} from "state/actions/sectionInfos";
import { getParamIdsToShowInArea } from "state/actions/sections/sectionContents";
import { useProjectState } from "state/definitions";
import { C } from "utils/c";
import { UITypeNameEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbGuiToYaml(sectionId, variantId) {
  const sectionType = getSectionType(sectionId);
  switch (sectionType) {
    case UITypeNameEnum.GLOBAL_VARIABLES:
    case UITypeNameEnum.SECTION:
      return await dbSectionToYaml(variantId);
  }
}

async function dbSectionToYaml(variantId) {
  const state = useProjectState.getState();
  const { codeInfoChildren, parentCodeInfoId } =
    getCodeChildrenAndParentCodeInfoId(null, state, variantId);
  const codeInfo = state.codeInfo;
  const pinnedIds = getParamIdsToShowInArea(
    true,
    codeInfo,
    codeInfoChildren,
    parentCodeInfoId,
  );
  const unpinnedIds = getParamIdsToShowInArea(
    false,
    codeInfo,
    codeInfoChildren,
    parentCodeInfoId,
  );
  pinnedIds.requiredParamIds = Object.keys(pinnedIds.requiredParamIdsToPaths);
  unpinnedIds.requiredParamIds = Object.keys(
    unpinnedIds.requiredParamIdsToPaths,
  );
  delete pinnedIds.requiredParamIdsToPaths;
  delete unpinnedIds.requiredParamIdsToPaths;
  const sectionVariant = state.variants[variantId];
  const res = await post({
    body: {
      codeInfo,
      codeInfoChildren,
      sectionVariant,
      pinnedIds,
      unpinnedIds,
    },
    address: C.ROUTE_SECTION_TO_YAML,
  });
  return res;
}
