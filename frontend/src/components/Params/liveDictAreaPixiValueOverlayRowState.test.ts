import { createProjectSearchLookupKey } from "state/hooks/search";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaPixiValueOverlayRowState } from "./liveDictAreaPixiValueOverlayRowState";

describe("buildLiveDictAreaPixiValueOverlayRowState", () => {
  it("resolves display/search/error state for one active Pixi value row", () => {
    const rowState = buildLiveDictAreaPixiValueOverlayRowState({
      focusedSearchResult: {
        paramInfoId: "gridColor",
        sectionId: "settings",
      },
      paramErrors: ["Color is invalid"],
      rowBaseState: {
        coreNameEditable: false,
        description: "Grid color description",
        displayName: "Grid Color",
        isSelected: true,
        name: "gridColor",
        showParamDisplayNames: true,
      },
      rowId: "gridColor",
      searchLookup: new Set([
        createProjectSearchLookupKey("settings", "gridColor"),
      ]),
      sectionId: "settings",
    });

    expect(rowState).toEqual({
      coreNameEditable: false,
      description: "Grid color description",
      errorMessage: "Color is invalid",
      isFocusedSearchResult: true,
      isSearchResult: true,
      isSelected: true,
      paramName: "Grid Color",
    });
  });
});
