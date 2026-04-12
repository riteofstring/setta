import { describe, expect, it } from "vitest";
import { resolveSettingsGraphSubstrateCanarySectionGeometry } from "./settingsGraphSubstrateCanarySectionGeometry";

describe("settingsGraphSubstrateCanarySectionGeometry", () => {
  it("keeps stored layout size authoritative for locked sections while applying drag overrides", () => {
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
          sectionId: "locked-section",
          position: { x: 420, y: 260 },
        },
      ),
    ).toEqual({
      renderedPosition: { x: 420, y: 260 },
      sceneBoundsSize: { width: 240, height: 160 },
    });
  });

  it("keeps section-model size authoritative in scene geometry", () => {
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
        null,
      ),
    ).toEqual({
      renderedPosition: { x: 120, y: 80 },
      sceneBoundsSize: { width: 550, height: 78 },
    });
  });

  it("keeps shared-node size authoritative in scene geometry", () => {
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
        null,
      ),
    ).toEqual({
      renderedPosition: { x: 120, y: 80 },
      sceneBoundsSize: { width: 240, height: 160 },
    });
  });

  it("keeps scene bounds unresolved when the current section size is missing", () => {
    expect(
      resolveSettingsGraphSubstrateCanarySectionGeometry(
        {
          sectionId: "unresolved-section",
          position: { x: 120, y: 80 },
          width: null,
          height: null,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
          sizeAuthority: "none",
        },
        null,
      ),
    ).toEqual({
      renderedPosition: { x: 120, y: 80 },
      sceneBoundsSize: null,
    });
  });
});
