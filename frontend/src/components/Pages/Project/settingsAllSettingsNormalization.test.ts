import { describe, expect, it } from "vitest";
import {
  buildNormalizedAllSettingsTopLevelSections,
  SETTINGS_ALL_SETTINGS_NORMALIZATION_GRID_COLUMNS,
  SETTINGS_ALL_SETTINGS_NORMALIZATION_MIN_CELL_SIZE_PX,
} from "./settingsAllSettingsNormalization";

describe("buildNormalizedAllSettingsTopLevelSections", () => {
  it("packs each All Settings column and row from the measured section sizes", () => {
    const layout = buildNormalizedAllSettingsTopLevelSections({
      gridColumns: SETTINGS_ALL_SETTINGS_NORMALIZATION_GRID_COLUMNS,
      measuredSectionSizesById: {
        "section-a": { height: 620, width: 700 },
        "section-b": { height: 610, width: 640 },
        "section-c": { height: 900, width: 1200 },
        "section-d": { height: 650, width: 610 },
      },
      minimumCellSizePx: SETTINGS_ALL_SETTINGS_NORMALIZATION_MIN_CELL_SIZE_PX,
      orderedSectionNames: ["a", "b", "c", "d"],
      sectionIdByName: {
        a: "section-a",
        b: "section-b",
        c: "section-c",
        d: "section-d",
      },
    });

    expect(layout).toEqual({
      "section-a": expect.objectContaining({ x: 0, y: 0 }),
      "section-b": expect.objectContaining({ x: 700, y: 0 }),
      "section-c": expect.objectContaining({ x: 1340, y: 0 }),
      "section-d": expect.objectContaining({ x: 0, y: 900 }),
    });
  });

  it("falls back to the minimum cell size for smaller measured sections", () => {
    const layout = buildNormalizedAllSettingsTopLevelSections({
      gridColumns: 2,
      measuredSectionSizesById: {
        "section-a": { height: 200, width: 300 },
        "section-b": { height: 250, width: 350 },
        "section-c": { height: 220, width: 320 },
      },
      minimumCellSizePx: 600,
      orderedSectionNames: ["a", "b", "c"],
      sectionIdByName: {
        a: "section-a",
        b: "section-b",
        c: "section-c",
      },
    });

    expect(layout).toEqual({
      "section-a": expect.objectContaining({ x: 0, y: 0 }),
      "section-b": expect.objectContaining({ x: 600, y: 0 }),
      "section-c": expect.objectContaining({ x: 0, y: 600 }),
    });
  });

  it("fails loudly when a measured node size is missing", () => {
    expect(() =>
      buildNormalizedAllSettingsTopLevelSections({
        gridColumns: 3,
        measuredSectionSizesById: {
          "section-a": { height: 620, width: 700 },
        },
        minimumCellSizePx: 600,
        orderedSectionNames: ["a", "b"],
        sectionIdByName: {
          a: "section-a",
          b: "section-b",
        },
      }),
    ).toThrow("Missing measured node size for All Settings normalization: b");
  });
});
