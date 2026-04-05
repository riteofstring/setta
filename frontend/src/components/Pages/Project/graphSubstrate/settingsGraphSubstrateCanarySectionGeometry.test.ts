import { describe, expect, it } from "vitest";
import {
  resolveSettingsGraphSubstrateCanarySectionGeometry,
  shouldObserveSettingsGraphSubstrateCanarySectionElementSize,
} from "./settingsGraphSubstrateCanarySectionGeometry";

describe("settingsGraphSubstrateCanarySectionGeometry", () => {
  it("keeps layout size authoritative for locked sections even when the measured registry disagrees", () => {
    expect(
      resolveSettingsGraphSubstrateCanarySectionGeometry(
        {
          sectionId: "locked-section",
          position: { x: 120, y: 80 },
          width: 240,
          height: 160,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: true,
        },
        {
          "locked-section": { width: 360, height: 210 },
        },
        {
          sectionId: "locked-section",
          position: { x: 420, y: 260 },
        },
      ),
    ).toEqual({
      renderedPosition: { x: 420, y: 260 },
      resolvedSize: { width: 240, height: 160 },
    });
  });

  it("stops observing shared measured size when a locked section already has layout geometry", () => {
    expect(
      shouldObserveSettingsGraphSubstrateCanarySectionElementSize({
        width: 240,
        height: 160,
        positionAndSizeLocked: true,
      }),
    ).toBe(false);
  });

  it("still prefers the live measured size for unlocked sections", () => {
    expect(
      resolveSettingsGraphSubstrateCanarySectionGeometry(
        {
          sectionId: "unlocked-section",
          position: { x: 120, y: 80 },
          width: 240,
          height: 160,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
        },
        {
          "unlocked-section": { width: 360, height: 210 },
        },
        null,
      ),
    ).toEqual({
      renderedPosition: { x: 120, y: 80 },
      resolvedSize: { width: 360, height: 210 },
    });
  });

  it("keeps the measured fallback for locked sections whose layout geometry is still missing", () => {
    expect(
      shouldObserveSettingsGraphSubstrateCanarySectionElementSize({
        width: null,
        height: null,
        positionAndSizeLocked: true,
      }),
    ).toBe(true);

    expect(
      resolveSettingsGraphSubstrateCanarySectionGeometry(
        {
          sectionId: "locked-section",
          position: { x: 120, y: 80 },
          width: null,
          height: null,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: true,
        },
        {
          "locked-section": { width: 360, height: 210 },
        },
        null,
      ),
    ).toEqual({
      renderedPosition: { x: 120, y: 80 },
      resolvedSize: { width: 360, height: 210 },
    });
  });

  it("falls back to layout size when no measured size exists", () => {
    expect(
      resolveSettingsGraphSubstrateCanarySectionGeometry(
        {
          sectionId: "section-a",
          position: { x: 120, y: 80 },
          width: 240,
          height: 160,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
        },
        {},
        null,
      ),
    ).toEqual({
      renderedPosition: { x: 120, y: 80 },
      resolvedSize: { width: 240, height: 160 },
    });
  });
});
