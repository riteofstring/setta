import { createViewModeConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { compactViewModeSortIndices } from "./ViewingEditingMode";

describe("compactViewModeSortIndices", () => {
  it("reassigns sequential sort indices using the current sorted order", () => {
    const modeA = createViewModeConfig({
      id: "mode-a",
      name: "Mode A",
      sortIndex: 8,
    });
    const modeB = createViewModeConfig({
      id: "mode-b",
      name: "Mode B",
      sortIndex: 2,
    });
    const modeC = createViewModeConfig({
      id: "mode-c",
      name: "Mode C",
      sortIndex: 5,
    });
    const viewModes = {
      [modeA.id]: modeA,
      [modeB.id]: modeB,
      [modeC.id]: modeC,
    };

    const sortedModes = compactViewModeSortIndices(viewModes);

    expect(sortedModes.map((mode) => mode.id)).toEqual([
      modeB.id,
      modeC.id,
      modeA.id,
    ]);
    expect(viewModes[modeB.id]?.sortIndex).toBe(0);
    expect(viewModes[modeC.id]?.sortIndex).toBe(1);
    expect(viewModes[modeA.id]?.sortIndex).toBe(2);
  });
});
