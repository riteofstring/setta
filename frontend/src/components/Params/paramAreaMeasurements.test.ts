import { describe, expect, it } from "vitest";
import {
  buildParamAreaMeasureKey,
  measureParamAreaMinHeight,
} from "./paramAreaMeasurements";

describe("param area measurements", () => {
  it("avoids outlier row heights when computing min height", () => {
    const minHeight = measureParamAreaMinHeight({
      rowHeights: [20, 20, 100],
      headerHeight: 0,
      paddingTop: 0,
      paddingBottom: 0,
    });
    expect(minHeight).toBe(20);
  });

  it("returns 0 min height when no valid row heights exist", () => {
    const minHeight = measureParamAreaMinHeight({
      rowHeights: [0, -1, Number.NaN],
      headerHeight: 12,
      paddingTop: 6,
      paddingBottom: 4,
    });
    expect(minHeight).toBe(0);
  });

  it("builds a new measure key when section width changes", () => {
    const base = buildParamAreaMeasureKey({
      paramIds: ["a", "b"],
      sectionWidth: 240,
      columnWidth: null,
    });
    const updated = buildParamAreaMeasureKey({
      paramIds: ["a", "b"],
      sectionWidth: 320,
      columnWidth: null,
    });
    expect(base).not.toBe(updated);
  });

  it("computes min height from padding, header, and representative row height", () => {
    const minHeight = measureParamAreaMinHeight({
      rowHeights: [18, 18, 24],
      headerHeight: 12,
      paddingTop: 6,
      paddingBottom: 4,
    });
    expect(minHeight).toBe(40);
  });
});
