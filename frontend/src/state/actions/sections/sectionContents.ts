import { ZustandProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import {
  getCurrEffectiveSectionImpl,
  getCurrSectionVariantId,
  getParamDisplayName,
  getParamTrueName,
} from "../sectionInfos";

export type ParamNameSource = "display" | "true";

export function paramNameFromPathArray(
  state: ZustandProjectState,
  currPath: Array<string>,
  nameSource: ParamNameSource = "display",
) {
  let getNameForId = getParamDisplayName;
  if (nameSource === "true") {
    getNameForId = getParamTrueName;
  }
  if (currPath.length === 1) {
    return getNameForId(state, currPath[0]);
  }
  let name = "";
  for (const [pathIdx, currId] of currPath.entries()) {
    const displayName = getNameForId(state, currId);
    if (pathIdx === 0) {
      name = displayName;
    } else {
      name += `["${displayName}"]`;
    }
  }
  return name;
}

export function getAllVisibleParamsInSection(
  state: ZustandProjectState,
  sectionId: string,
): Array<string> {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (!isBaseSectionWithParamsImpl(impl)) {
    return [];
  }
  const variantId = getCurrSectionVariantId(state, sectionId);
  const shown = state.shownParamIds[variantId];
  if (!shown) {
    return [];
  }

  const pinnedIds = Object.keys(shown.pinned.requiredParamIdsToPaths);

  let unpinnedIds: Array<string> = [];
  if (!impl.hideUnpinnedParams) {
    unpinnedIds = Object.keys(shown.unpinned.requiredParamIdsToPaths);
  }

  return [...pinnedIds, ...unpinnedIds];
}
