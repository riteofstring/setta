import { createProjectSearchLookupKey } from "state/hooks/search";
import { resolveParamContainerDisplayName } from "./paramContainerView";

export type LiveDictAreaPixiValueOverlayRowBaseState = {
  coreNameEditable: boolean;
  description: string;
  displayName: string;
  isSelected: boolean;
  name: string;
  showParamDisplayNames: boolean;
};

export type LiveDictAreaPixiValueOverlayRowState = {
  coreNameEditable: boolean;
  description: string;
  errorMessage: string;
  isFocusedSearchResult: boolean;
  isSearchResult: boolean;
  isSelected: boolean;
  paramName: string;
};

export type LiveDictAreaPixiValueOverlayRowStateLookup = Record<
  string,
  LiveDictAreaPixiValueOverlayRowState
>;

type BuildLiveDictAreaPixiValueOverlayRowStateLookupArgs = {
  focusedSearchResult: {
    paramInfoId: string;
    sectionId: string;
  } | null;
  paramErrorsById: Record<string, string[]>;
  rowBaseStateById: Record<string, LiveDictAreaPixiValueOverlayRowBaseState>;
  rowIds: string[];
  searchLookup: Set<string>;
  sectionId: string;
};

export function buildLiveDictAreaPixiValueOverlayRowStateLookup({
  focusedSearchResult,
  paramErrorsById,
  rowBaseStateById,
  rowIds,
  searchLookup,
  sectionId,
}: BuildLiveDictAreaPixiValueOverlayRowStateLookupArgs): LiveDictAreaPixiValueOverlayRowStateLookup {
  const focusedParamInfoId =
    focusedSearchResult?.sectionId === sectionId
      ? focusedSearchResult.paramInfoId
      : null;

  return Object.fromEntries(
    rowIds.map((rowId) => {
      const rowBaseState = rowBaseStateById[rowId];
      if (!rowBaseState) {
        throw new Error(`Missing Pixi value-overlay base state for ${rowId}.`);
      }

      return [
        rowId,
        {
          coreNameEditable: rowBaseState.coreNameEditable,
          description: rowBaseState.description,
          errorMessage: paramErrorsById[rowId]?.join("\n") ?? "",
          isFocusedSearchResult: focusedParamInfoId === rowId,
          isSearchResult: searchLookup.has(
            createProjectSearchLookupKey(sectionId, rowId),
          ),
          isSelected: rowBaseState.isSelected,
          paramName: resolveParamContainerDisplayName({
            paramDisplayName: rowBaseState.displayName,
            paramName: rowBaseState.name,
            preferCoreName: rowBaseState.coreNameEditable,
            showParamDisplayNames: rowBaseState.showParamDisplayNames,
          }),
        },
      ];
    }),
  );
}
