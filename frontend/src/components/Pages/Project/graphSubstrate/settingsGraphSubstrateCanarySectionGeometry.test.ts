import { describe, expect, it } from "vitest";
import { resolveSettingsGraphSubstrateCanarySectionGeometry } from "./settingsGraphSubstrateCanarySectionGeometry";

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
