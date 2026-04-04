import { describe, expect, it } from "vitest";
import { getSettingsGraphSubstrateCanarySceneBounds } from "./settingsGraphSubstrateCanaryBounds";

describe("settingsGraphSubstrateCanaryBounds", () => {
  const sections = [
    {
      sectionId: "section-a",
      position: { x: 120, y: 80 },
      zIndex: 1,
      width: 200,
      height: 140,
      positionAndSizeLocked: false,
    },
    {
      sectionId: "section-b",
      position: { x: 460, y: 260 },
      zIndex: 2,
      width: 180,
      height: 120,
      positionAndSizeLocked: false,
    },
  ];

  it("waits for measured sizes from every visible canary section", () => {
    expect(
      getSettingsGraphSubstrateCanarySceneBounds(
        sections,
        {
          "section-a": { width: 340, height: 220 },
        },
        null,
      ),
    ).toBeNull();
  });

  it("computes scene bounds from measured section sizes and drag overrides", () => {
    expect(
      getSettingsGraphSubstrateCanarySceneBounds(
        sections,
        {
          "section-a": { width: 340, height: 220 },
          "section-b": { width: 280, height: 180 },
        },
        {
          sectionId: "section-b",
          position: { x: 520, y: 300 },
        },
      ),
    ).toEqual({
      x: 120,
      y: 80,
      width: 680,
      height: 400,
    });
  });
});
