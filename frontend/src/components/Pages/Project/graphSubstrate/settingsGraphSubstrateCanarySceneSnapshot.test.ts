import { describe, expect, it } from "vitest";
import {
  getSettingsGraphSubstrateCanarySceneBoundsForSections,
  resolveSettingsGraphSubstrateCanarySceneSnapshot,
} from "./settingsGraphSubstrateCanarySceneSnapshot";

describe("settingsGraphSubstrateCanarySceneSnapshot", () => {
  it("keeps layout-resolved size authoritative while still applying live drag overrides", () => {
    const snapshot = resolveSettingsGraphSubstrateCanarySceneSnapshot(
      [
        {
          sectionId: "section-a",
          position: { x: 120, y: 80 },
          width: 240,
          height: 160,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
        },
        {
          sectionId: "section-b",
          position: { x: 400, y: 220 },
          width: null,
          height: null,
          zIndex: 1,
          tempZIndex: 1,
          positionAndSizeLocked: false,
        },
      ],
      {
        "section-a": { width: 360, height: 210 },
        "section-b": { width: 280, height: 190 },
      },
      {
        sectionId: "section-a",
        position: { x: 180, y: 140 },
      },
      "section-a",
    );

    expect(snapshot.sections).toEqual([
      {
        sectionId: "section-a",
        position: { x: 120, y: 80 },
        renderedPosition: { x: 180, y: 140 },
        width: 240,
        height: 160,
        resolvedSize: { width: 240, height: 160 },
        zIndex: 2,
        tempZIndex: 1002,
        positionAndSizeLocked: false,
      },
      {
        sectionId: "section-b",
        position: { x: 400, y: 220 },
        renderedPosition: { x: 400, y: 220 },
        width: null,
        height: null,
        resolvedSize: { width: 280, height: 190 },
        zIndex: 1,
        tempZIndex: 1,
        positionAndSizeLocked: false,
      },
    ]);
    expect(snapshot.sceneBounds).toEqual({
      x: 180,
      y: 140,
      width: 500,
      height: 270,
    });
  });

  it("derives subset bounds from the shared snapshot sections used by fit view", () => {
    const snapshot = resolveSettingsGraphSubstrateCanarySceneSnapshot(
      [
        {
          sectionId: "section-a",
          position: { x: 120, y: 80 },
          width: 240,
          height: 160,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
        },
        {
          sectionId: "section-b",
          position: { x: 400, y: 220 },
          width: 280,
          height: 190,
          zIndex: 1,
          tempZIndex: 1,
          positionAndSizeLocked: false,
        },
      ],
      {},
      null,
      null,
    );

    // Fit view should be able to reuse the snapshot instead of recomputing
    // size/position resolution from separate raw inputs.
    expect(
      getSettingsGraphSubstrateCanarySceneBoundsForSections([
        snapshot.sections[1],
      ]),
    ).toEqual({
      x: 400,
      y: 220,
      width: 280,
      height: 190,
    });
  });
});
