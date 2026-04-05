import { describe, expect, it } from "vitest";
import { getSettingsGraphSubstrateCanarySceneBounds } from "./settingsGraphSubstrateCanaryBounds";

describe("settingsGraphSubstrateCanaryBounds", () => {
  it("keeps authoritative layout size when the top-level layout already defines it", () => {
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
      width: 552,
      height: 352,
    });
  });

  it("falls back to the live observed size when layout geometry is missing", () => {
    const bounds = getSettingsGraphSubstrateCanarySceneBounds(
      [
        {
          sectionId: "browser",
          position: { x: 120, y: 1280 },
          zIndex: 1,
          tempZIndex: 1,
          width: null,
          height: null,
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
});
