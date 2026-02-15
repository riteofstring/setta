import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { getProjectTopLevelSectionCount } from "./HomePage";

describe("HomePage", () => {
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
