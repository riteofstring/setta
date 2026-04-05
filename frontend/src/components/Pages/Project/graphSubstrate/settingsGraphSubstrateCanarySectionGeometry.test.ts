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
      sceneBoundsSize: { width: 240, height: 160 },
    });
  });

  it("stops observing shared measured size when layout geometry already exists, even for unlocked sections", () => {
    expect(
      shouldObserveSettingsGraphSubstrateCanarySectionElementSize({
        width: 240,
        height: 160,
        positionAndSizeLocked: false,
      }),
    ).toBe(false);
  });

  it("stops observing measured size when section-model geometry already exists", () => {
    expect(
      shouldObserveSettingsGraphSubstrateCanarySectionElementSize({
        width: 550,
        height: 78,
        positionAndSizeLocked: false,
        sizeAuthority: "sectionModel",
      }),
    ).toBe(false);

    expect(
      resolveSettingsGraphSubstrateCanarySectionGeometry(
        {
          sectionId: "section-model-section",
          position: { x: 120, y: 80 },
          width: 550,
          height: 78,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
          sizeAuthority: "sectionModel",
        },
        {
          "section-model-section": { width: 620, height: 210 },
        },
        null,
      ),
    ).toEqual({
      renderedPosition: { x: 120, y: 80 },
      resolvedSize: { width: 550, height: 78 },
      sceneBoundsSize: { width: 550, height: 78 },
    });
  });

  it("keeps observing measured size when a section is seeded from shared node authority", () => {
    expect(
      shouldObserveSettingsGraphSubstrateCanarySectionElementSize({
        width: 240,
        height: 160,
        positionAndSizeLocked: false,
        sizeAuthority: "sharedNode",
      }),
    ).toBe(true);

    expect(
      resolveSettingsGraphSubstrateCanarySectionGeometry(
        {
          sectionId: "shared-seeded-section",
          position: { x: 120, y: 80 },
          width: 240,
          height: 160,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
          sizeAuthority: "sharedNode",
        },
        {
          "shared-seeded-section": { width: 360, height: 210 },
        },
        null,
      ),
    ).toEqual({
      renderedPosition: { x: 120, y: 80 },
      resolvedSize: { width: 360, height: 210 },
      sceneBoundsSize: { width: 360, height: 210 },
    });
  });

  it("keeps layout size authoritative for unlocked sections even when the measured registry disagrees", () => {
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
      resolvedSize: { width: 240, height: 160 },
      sceneBoundsSize: { width: 240, height: 160 },
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
      sceneBoundsSize: null,
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
      sceneBoundsSize: { width: 240, height: 160 },
    });
  });
});
