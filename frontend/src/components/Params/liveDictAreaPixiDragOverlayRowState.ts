import { createProjectSearchLookupKey } from "state/hooks/search";
import type { ParamSceneRowPacket } from "./paramSwitchScenePackets";

export type LiveDictAreaPixiDragOverlayRowState = {
  hasError: boolean;
  isFocusedSearchResult: boolean;
  isSearchResult: boolean;
  isSelected: boolean;
};

export type LiveDictAreaPixiDragOverlayRowStateLookup = Record<
  string,
  LiveDictAreaPixiDragOverlayRowState
>;

export const DEFAULT_LIVE_DICT_AREA_PIXI_DRAG_OVERLAY_ROW_STATE: LiveDictAreaPixiDragOverlayRowState =
  {
    hasError: false,
    isFocusedSearchResult: false,
    isSearchResult: false,
    isSelected: false,
  };

type BuildLiveDictAreaPixiDragOverlayRowStateLookupArgs = {
  focusedSearchResult: {
    paramInfoId: string;
    sectionId: string;
  } | null;
  paramErrorsById: Record<string, string[]>;
  sceneRows: ParamSceneRowPacket[];
  searchLookup: Set<string>;
  sectionId: string;
  selectedParamIds: string[];
};

export function buildLiveDictAreaPixiDragOverlayRowStateLookup({
  focusedSearchResult,
  paramErrorsById,
  sceneRows,
  searchLookup,
  sectionId,
  selectedParamIds,
}: BuildLiveDictAreaPixiDragOverlayRowStateLookupArgs): LiveDictAreaPixiDragOverlayRowStateLookup {
  const selectedParamIdSet = new Set(selectedParamIds);
  const focusedParamInfoId =
    focusedSearchResult?.sectionId === sectionId
      ? focusedSearchResult.paramInfoId
      : null;

  return Object.fromEntries(
    sceneRows.map((sceneRow) => [
      sceneRow.id,
      {
        hasError: Boolean(paramErrorsById[sceneRow.id]?.length),
        isFocusedSearchResult: focusedParamInfoId === sceneRow.id,
        isSearchResult: searchLookup.has(
          createProjectSearchLookupKey(sectionId, sceneRow.id),
        ),
        isSelected: selectedParamIdSet.has(sceneRow.id),
      },
    ]),
  );
}
