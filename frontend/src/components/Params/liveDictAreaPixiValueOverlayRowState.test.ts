import { createProjectSearchLookupKey } from "state/hooks/search";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaPixiValueOverlayRowStateLookup } from "./liveDictAreaPixiValueOverlayRowState";

describe("buildLiveDictAreaPixiValueOverlayRowStateLookup", () => {
  it("resolves display/search/error state for visible Pixi value rows", () => {
    const lookup = buildLiveDictAreaPixiValueOverlayRowStateLookup({
      focusedSearchResult: {
        paramInfoId: "gridColor",
        sectionId: "settings",
      },
      paramErrorsById: {
        gridColor: ["Color is invalid"],
      },
      rowBaseStateById: {
        gridColor: {
          coreNameEditable: false,
          description: "Grid color description",
          displayName: "Grid Color",
          isSelected: true,
          name: "gridColor",
          showParamDisplayNames: true,
        },
        kwargs: {
          coreNameEditable: true,
          description: "Kwarg description",
          displayName: "Kwargs Display",
          isSelected: false,
          name: "kwargs",
          showParamDisplayNames: true,
        },
      },
      rowIds: ["gridColor", "kwargs"],
      searchLookup: new Set([
        createProjectSearchLookupKey("settings", "gridColor"),
      ]),
      sectionId: "settings",
    });

    expect(lookup.gridColor).toEqual({
      coreNameEditable: false,
      description: "Grid color description",
      errorMessage: "Color is invalid",
      isFocusedSearchResult: true,
      isSearchResult: true,
      isSelected: true,
      paramName: "Grid Color",
    });
    expect(lookup.kwargs).toEqual({
      coreNameEditable: true,
      description: "Kwarg description",
      errorMessage: "",
      isFocusedSearchResult: false,
      isSearchResult: false,
      isSelected: false,
      paramName: "kwargs",
    });
  });
});
