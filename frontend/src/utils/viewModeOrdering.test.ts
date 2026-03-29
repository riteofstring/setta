import { createViewModeConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { sortViewModes } from "./viewModeOrdering";

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

  it("treats missing sortIndex as zero", () => {
    const sorted = sortViewModes([
      createViewModeConfig({
        id: "b",
        name: "Beta",
        sortIndex: 1,
      }),
      createViewModeConfig({
        id: "a",
        name: "Alpha",
      }),
      createViewModeConfig({
        id: "c",
        name: "Gamma",
      }),
    ]);

    expect(sorted.map((mode) => mode.id)).toEqual(["a", "c", "b"]);
  });
});
