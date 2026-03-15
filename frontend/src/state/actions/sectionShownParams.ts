import { type ZustandProjectState } from "state/definitions";
import { type ShownParamIds } from "utils/generatedTypes";
import { getCurrSectionVariantId } from "./sectionEffectiveImplSelectors";

type ShownParamBucket = ShownParamIds["pinned"];

export function getCurrShownParamIds(
  state: ZustandProjectState,
  sectionId: string,
  isPinned: boolean,
  preview = false,
): ShownParamBucket {
  const variantId = getCurrSectionVariantId(state, sectionId, preview);
  const shown = state.shownParamIds[variantId];
  if (!shown) {
    throw new Error();
  }
  return isPinned ? shown.pinned : shown.unpinned;
}

export function updateShownParamIdsForPinnedParams(
  state: ZustandProjectState,
  sectionId: string,
  nextPinnedParams: Array<string>,
  preview = true,
): void {
  const variantId = getCurrSectionVariantId(state, sectionId, preview);
  const shown = state.shownParamIds[variantId];
  if (!shown) {
    return;
  }
  const nextPinnedSet = new Set(nextPinnedParams);
  const nextPinnedTopLevel: Array<string> = [];
  const nextUnpinnedTopLevel: Array<string> = [];
  for (const paramId of shown.pinned.topLevelParamIds) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedTopLevel.push(paramId);
    } else {
      nextUnpinnedTopLevel.push(paramId);
    }
  }
  for (const paramId of shown.unpinned.topLevelParamIds) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedTopLevel.push(paramId);
    } else {
      nextUnpinnedTopLevel.push(paramId);
    }
  }
  const nextPinnedRequired: Record<string, Array<string>> = {};
  const nextUnpinnedRequired: Record<string, Array<string>> = {};
  for (const [paramId, path] of Object.entries(
    shown.pinned.requiredParamIdsToPaths,
  )) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedRequired[paramId] = path;
    } else {
      nextUnpinnedRequired[paramId] = path;
    }
  }
  for (const [paramId, path] of Object.entries(
    shown.unpinned.requiredParamIdsToPaths,
  )) {
    if (nextPinnedSet.has(paramId)) {
      nextPinnedRequired[paramId] = path;
    } else {
      nextUnpinnedRequired[paramId] = path;
    }
  }

  state.shownParamIds[variantId] = {
    pinned: {
      ...shown.pinned,
      topLevelParamIds: nextPinnedTopLevel,
      requiredParamIdsToPaths: nextPinnedRequired,
    },
    unpinned: {
      ...shown.unpinned,
      topLevelParamIds: nextUnpinnedTopLevel,
      requiredParamIdsToPaths: nextUnpinnedRequired,
    },
  };
}
