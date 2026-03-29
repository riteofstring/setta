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

type BuildLiveDictAreaPixiValueOverlayRowStateArgs = {
  focusedSearchResult: {
    paramInfoId: string;
    sectionId: string;
  } | null;
  paramErrors: string[];
  rowBaseState: LiveDictAreaPixiValueOverlayRowBaseState;
  rowId: string;
  searchLookup: Set<string>;
  sectionId: string;
};

export function buildLiveDictAreaPixiValueOverlayRowState({
  focusedSearchResult,
  paramErrors,
  rowBaseState,
  rowId,
  searchLookup,
  sectionId,
}: BuildLiveDictAreaPixiValueOverlayRowStateArgs): LiveDictAreaPixiValueOverlayRowState {
  const focusedParamInfoId =
    focusedSearchResult?.sectionId === sectionId
      ? focusedSearchResult.paramInfoId
      : null;

  return {
    coreNameEditable: rowBaseState.coreNameEditable,
    description: rowBaseState.description,
    errorMessage: paramErrors.join("\n"),
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
  };
}
