import { createProjectSearchLookupKey } from "state/hooks/search";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaPixiDragOverlayRowStateLookup } from "./liveDictAreaPixiDragOverlayRowState";

describe("buildLiveDictAreaPixiDragOverlayRowStateLookup", () => {
  it("derives selected, focused, search, and error flags from one overlay-level input", () => {
    const result = buildLiveDictAreaPixiDragOverlayRowStateLookup({
      focusedSearchResult: {
        paramInfoId: "focused-param",
        sectionId: "section-a",
      },
      paramErrorsById: {
        "error-param": ["Bad type"],
      },
      sceneRows: [
        { depth: 0, id: "selected-param", kind: "value", label: "Selected" },
        { depth: 0, id: "error-param", kind: "value", label: "Error" },
        { depth: 0, id: "focused-param", kind: "value", label: "Focused" },
        { depth: 0, id: "other-param", kind: "value", label: "Other" },
      ],
      searchLookup: new Set([
        createProjectSearchLookupKey("section-a", "other-param"),
        createProjectSearchLookupKey("section-b", "focused-param"),
      ]),
      sectionId: "section-a",
      selectedParamIds: ["selected-param"],
    });

    expect(result["selected-param"]).toEqual({
      hasError: false,
      isFocusedSearchResult: false,
      isSearchResult: false,
      isSelected: true,
    });
    expect(result["error-param"]).toEqual({
      hasError: true,
      isFocusedSearchResult: false,
      isSearchResult: false,
      isSelected: false,
    });
    expect(result["focused-param"]).toEqual({
      hasError: false,
      isFocusedSearchResult: true,
      isSearchResult: false,
      isSelected: false,
    });
    expect(result["other-param"]).toEqual({
      hasError: false,
      isFocusedSearchResult: false,
      isSearchResult: true,
      isSelected: false,
    });
  });
});
