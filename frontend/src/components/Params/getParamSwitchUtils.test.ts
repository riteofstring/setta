import { getTempParamDndId } from "forks/dnd-kit/paramDndState";
import { describe, expect, it } from "vitest";
import {
  buildFilteredRequiredParamSet,
  filterParamIdsForRender,
} from "./getParamSwitchUtils";

describe("getParamSwitchUtils", () => {
  it("returns null when the section param filter is blank", () => {
    const result = buildFilteredRequiredParamSet({
      paramFilter: "   ",
      requiredParamIdsToPaths: {
        alpha: ["alpha"],
      },
      getParamName: (paramId) => paramId,
    });
    expect(result).toBeNull();
  });

  it("expands matched ids to include the full required path chain", () => {
    const filteredRequiredParamIds = buildFilteredRequiredParamSet({
      paramFilter: "beta",
      requiredParamIdsToPaths: {
        alpha: ["root", "alpha"],
        beta: ["root", "group", "beta"],
      },
      getParamName: (paramId) => {
        if (paramId === "alpha") {
          return "alpha";
        }
        return "beta";
      },
    });
    expect(filteredRequiredParamIds).not.toBeNull();

    // Matching "beta" should keep the full parent path so nested layout remains intact.
    expect(filteredRequiredParamIds?.has("root")).toBe(true);
    expect(filteredRequiredParamIds?.has("group")).toBe(true);
    expect(filteredRequiredParamIds?.has("beta")).toBe(true);
    expect(filteredRequiredParamIds?.has("alpha")).toBe(false);
  });

  it("keeps temp dnd params visible even when they are not in the filter set", () => {
    const tempParamId = getTempParamDndId("beta");
    const visibleParamIds = filterParamIdsForRender(
      ["alpha", "group", "beta", tempParamId],
      new Set(["group", "beta"]),
    );

    // Temp placeholders must remain visible during drag operations.
    expect(visibleParamIds).toEqual(["group", "beta", tempParamId]);
  });
});
