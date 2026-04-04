import { describe, expect, it } from "vitest";
import { getSettingsGraphSubstrateCanarySceneBounds } from "./settingsGraphSubstrateCanaryBounds";

describe("settingsGraphSubstrateCanaryBounds", () => {
  it("prefers the live observed section size over a larger stale layout size", () => {
    const bounds = getSettingsGraphSubstrateCanarySceneBounds(
      [
        {
          sectionId: "browser",
          position: { x: 120, y: 1280 },
          zIndex: 1,
          tempZIndex: 1,
          width: 552,
          height: 352,
          positionAndSizeLocked: false,
        },
      ],
      {
        browser: {
          width: 320,
          height: 240,
        },
      },
      null,
    );

    expect(bounds).toEqual({
      x: 120,
      y: 1280,
      width: 320,
      height: 240,
    });
  });

  it("falls back to the stored layout size when no live measurement is available", () => {
    const bounds = getSettingsGraphSubstrateCanarySceneBounds(
      [
        {
          sectionId: "browser",
          position: { x: 120, y: 1280 },
          zIndex: 1,
          tempZIndex: 1,
          width: 552,
          height: 352,
          positionAndSizeLocked: false,
        },
      ],
      {},
      null,
    );

    expect(bounds).toEqual({
      x: 120,
      y: 1280,
      width: 552,
      height: 352,
    });
  });
});
