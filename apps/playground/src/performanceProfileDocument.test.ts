import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_PROFILE_COLUMNS,
  PERFORMANCE_PROFILE_DRAG_TARGET_ID,
  PERFORMANCE_PROFILE_ROWS,
  PERFORMANCE_PROFILE_SECTION_COUNT,
  performanceProfileDocument,
} from "./performanceProfileDocument";

describe("performance profile document", () => {
  it("keeps the declared 16 by 16 large-document fixture deterministic", () => {
    expect(PERFORMANCE_PROFILE_COLUMNS).toBe(16);
    expect(PERFORMANCE_PROFILE_ROWS).toBe(16);
    expect(PERFORMANCE_PROFILE_SECTION_COUNT).toBe(256);
    expect(Object.keys(performanceProfileDocument.sections)).toHaveLength(
      PERFORMANCE_PROFILE_SECTION_COUNT,
    );
    expect(Object.keys(performanceProfileDocument.topLevelSections)).toHaveLength(
      PERFORMANCE_PROFILE_SECTION_COUNT,
    );
    expect(performanceProfileDocument.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("provides one visible, fixed-size drag target and a large measured plane", () => {
    expect(performanceProfileDocument.sections[PERFORMANCE_PROFILE_DRAG_TARGET_ID]?.name).toBe(
      "Performance drag target",
    );
    expect(performanceProfileDocument.topLevelSections[PERFORMANCE_PROFILE_DRAG_TARGET_ID]).toEqual(
      {
        x: 855,
        y: 210,
        w: 200,
        h: 122,
        zIndex: 19,
      },
    );

    const layouts = Object.values(performanceProfileDocument.topLevelSections);
    expect(Math.max(...layouts.map(({ x, w }) => x + (w ?? 0)))).toBe(4_295);
    expect(Math.max(...layouts.map(({ y, h }) => y + (h ?? 0)))).toBe(2_642);
  });
});
