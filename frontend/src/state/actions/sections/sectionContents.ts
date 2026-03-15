import { ZustandProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { getParamDisplayName } from "../sectionFeatureSelectors";
import {
  getCurrEffectiveSectionImpl,
  getCurrSectionVariantId,
} from "../sectionInfos";

export function paramNameFromPathArray(
  state: ZustandProjectState,
  sectionId: string,
  currPath: Array<string>,
) {
  if (currPath.length === 1) {
    return getParamDisplayName(state, sectionId, currPath[0]);
  }
  let name = "";
  for (const [pathIdx, currId] of currPath.entries()) {
    const displayName = getParamDisplayName(state, sectionId, currId);
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

  const edgeInputParams = new Set(impl.edgeInputParams);
  const pinnedIds = Object.keys(shown.pinned.requiredParamIdsToPaths).filter(
    (id) => !edgeInputParams.has(id),
  );

  let unpinnedIds: Array<string> = [];
  if (!impl.hideUnpinnedParams) {
    unpinnedIds = Object.keys(shown.unpinned.requiredParamIdsToPaths).filter(
      (id) => !edgeInputParams.has(id),
    );
  }

  return [...pinnedIds, ...unpinnedIds];
}
