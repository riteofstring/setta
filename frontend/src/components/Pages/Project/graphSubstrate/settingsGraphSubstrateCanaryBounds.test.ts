import { describe, expect, it } from "vitest";
import { getSettingsGraphSubstrateCanarySceneBounds } from "./settingsGraphSubstrateCanaryBounds";

describe("settingsGraphSubstrateCanaryBounds", () => {
  it("keeps unlocked section bounds on layout size when current layout geometry already exists", () => {
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

  it("keeps locked section bounds on layout size even when a measured size exists", () => {
    const bounds = getSettingsGraphSubstrateCanarySceneBounds(
      [
        {
          sectionId: "browser",
          position: { x: 120, y: 1280 },
          zIndex: 1,
          tempZIndex: 1,
          width: 552,
          height: 352,
          positionAndSizeLocked: true,
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
