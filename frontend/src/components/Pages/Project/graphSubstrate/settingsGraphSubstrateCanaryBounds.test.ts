import { describe, expect, it } from "vitest";
import { getSettingsGraphSubstrateCanarySceneBounds } from "./settingsGraphSubstrateCanaryBounds";

describe("settingsGraphSubstrateCanaryBounds", () => {
  it("prefers the shared measured size when the visible section registry is fresher than layout", () => {
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
