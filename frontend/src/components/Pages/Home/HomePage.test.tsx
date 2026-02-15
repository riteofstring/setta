import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getHomeMaxTotalSideWidth,
  getProjectTopLevelSectionCount,
  shouldClampHomeSideColumnWidths,
} from "./HomePage";

describe("HomePage", () => {
  it("computes max side width budget from measured desktop width", () => {
    expect(getHomeMaxTotalSideWidth(1600)).toBe(1148);
  });

  it("never returns less than the minimum combined side width", () => {
    expect(getHomeMaxTotalSideWidth(640)).toBe(510);
  });

  it("skips side-column clamping until desktop width is measured", () => {
    expect(shouldClampHomeSideColumnWidths(true, null)).toBe(false);
    expect(shouldClampHomeSideColumnWidths(false, 1200)).toBe(false);
    expect(shouldClampHomeSideColumnWidths(true, 1200)).toBe(true);
  });

  it("counts top-level sections from object keys", () => {
    const project = createProjectConfig({
      id: "project-1",
      topLevelSections: {
        sectionA: { x: 0, y: 0, w: null, h: null },
        sectionB: { x: 1, y: 1, w: 100, h: 120 },
      },
    });

    expect(getProjectTopLevelSectionCount(project)).toBe(2);
  });
});
