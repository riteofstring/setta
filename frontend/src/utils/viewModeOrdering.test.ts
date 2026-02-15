import { createViewModeConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { reorderViewModeIdList, sortViewModes } from "./viewModeOrdering";

describe("viewModeOrdering", () => {
  it("sorts by sortIndex then by name and id", () => {
    const sorted = sortViewModes([
      createViewModeConfig({
        id: "b",
        name: "Beta",
        sortIndex: 1,
      }),
      createViewModeConfig({
        id: "a",
        name: "Alpha",
        sortIndex: 0,
      }),
      createViewModeConfig({
        id: "c",
        name: "alpha",
        sortIndex: 0,
      }),
    ]);

    expect(sorted.map((mode) => mode.id)).toEqual(["a", "c", "b"]);
  });

  it("reorders ids by active and over ids", () => {
    expect(reorderViewModeIdList(["a", "b", "c", "d"], "d", "b")).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });

  it("returns original ids when active or over id is missing", () => {
    const ids = ["a", "b", "c"];
    expect(reorderViewModeIdList(ids, "x", "b")).toBe(ids);
    expect(reorderViewModeIdList(ids, "a", "x")).toBe(ids);
  });
});
