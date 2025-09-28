import { ZustandProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import {
  getCurrEffectiveSectionImpl,
  getCurrSectionVariantId,
} from "../sectionInfos";

export function paramNameFromPathArray(
  codeObjs: ZustandProjectState["codeObjs"],
  currPath: Array<string>,
) {
  if (currPath.length === 1) {
    return codeObjs[currPath[0]].name;
  } else {
    let name = "";
    for (const [pathIdx, currId] of currPath.entries()) {
      if (pathIdx === 0) {
        name = codeObjs[currId].name;
      } else {
        name += `["${codeObjs[currId].name}"]`;
      }
    }
    return name;
  }
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
  pinnedIds.reverse();

  let unpinnedIds: Array<string> = [];
  if (!impl.hideUnpinnedParams) {
    unpinnedIds = Object.keys(shown.unpinned.requiredParamIdsToPaths);
    unpinnedIds.reverse();
  }

  return [...pinnedIds, ...unpinnedIds];
}
