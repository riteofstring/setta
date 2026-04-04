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

  it("waits until every visible canary section has either selector or observed size", () => {
    const sectionsWithMissingSize = [
      sections[0],
      {
        ...sections[1],
        width: null,
        height: null,
      },
    ];

    expect(
      getSettingsGraphSubstrateCanarySceneBounds(
        sectionsWithMissingSize,
        {
          "section-a": { width: 340, height: 220 },
        },
        null,
      ),
    ).toBeNull();
  });

  it("uses the larger of selector and observed section sizes when fitting bounds", () => {
    expect(
      getSettingsGraphSubstrateCanarySceneBounds(
        sections,
        {
          "section-a": { width: 340, height: 220 },
        },
        {
          sectionId: "section-b",
          position: { x: 520, y: 300 },
        },
      ),
    ).toEqual({
      x: 120,
      y: 80,
      width: 580,
      height: 340,
    });
  });

  it("keeps larger selector-provided sizes when observed DOM boxes are smaller", () => {
    expect(
      getSettingsGraphSubstrateCanarySceneBounds(
        sections,
        {
          "section-a": { width: 160, height: 100 },
          "section-b": { width: 120, height: 80 },
        },
        null,
      ),
    ).toEqual({
      x: 120,
      y: 80,
      width: 520,
      height: 300,
    });
  });
});
