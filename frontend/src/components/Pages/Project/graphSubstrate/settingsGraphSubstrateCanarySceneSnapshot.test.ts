import { describe, expect, it } from "vitest";
import {
  getSettingsGraphSubstrateCanarySceneBoundsForSections,
  resolveSettingsGraphSubstrateCanarySceneSnapshot,
} from "./settingsGraphSubstrateCanarySceneSnapshot";

describe("settingsGraphSubstrateCanarySceneSnapshot", () => {
  it("keeps layout size authoritative when current layout geometry exists while local measured fallback stays out of scene bounds", () => {
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
          sizeAuthority: "none",
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
        sceneBoundsSize: { width: 240, height: 160 },
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
        sizeAuthority: "none",
        resolvedSize: { width: 280, height: 190 },
        sceneBoundsSize: null,
        zIndex: 1,
        tempZIndex: 1,
        positionAndSizeLocked: false,
      },
    ]);
    expect(snapshot.sceneBounds).toEqual({
      x: 180,
      y: 140,
      width: 240,
      height: 160,
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
        snapshot.sections[1]!,
      ]),
    ).toEqual({
      x: 400,
      y: 220,
      width: 280,
      height: 190,
    });
  });

  it("keeps section-model size authoritative inside the scene snapshot", () => {
    const snapshot = resolveSettingsGraphSubstrateCanarySceneSnapshot(
      [
        {
          sectionId: "section-a",
          position: { x: 120, y: 80 },
          width: 550,
          height: 78,
          sizeAuthority: "sectionModel",
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
        },
      ],
      {
        "section-a": { width: 620, height: 210 },
      },
      null,
      null,
    );

    expect(snapshot.sections[0]).toEqual({
      sectionId: "section-a",
      position: { x: 120, y: 80 },
      renderedPosition: { x: 120, y: 80 },
      width: 550,
      height: 78,
      sizeAuthority: "sectionModel",
      resolvedSize: { width: 550, height: 78 },
      sceneBoundsSize: { width: 550, height: 78 },
      zIndex: 2,
      tempZIndex: 2,
      positionAndSizeLocked: false,
    });
    expect(snapshot.sceneBounds).toEqual({
      x: 120,
      y: 80,
      width: 550,
      height: 78,
    });
  });

  it("keeps scene bounds on the authoritative subset when another section is still unresolved", () => {
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
      {},
      null,
      null,
    );

    expect(snapshot.sections[0]?.resolvedSize).toEqual({
      width: 240,
      height: 160,
    });
    expect(snapshot.sections[0]?.sceneBoundsSize).toEqual({
      width: 240,
      height: 160,
    });
    expect(snapshot.sections[1]?.resolvedSize).toBeNull();
    expect(snapshot.sections[1]?.sceneBoundsSize).toBeNull();
    expect(snapshot.sceneBounds).toEqual({
      x: 120,
      y: 80,
      width: 240,
      height: 160,
    });
  });

  it("drops scene bounds when the current section geometry is no longer available", () => {
    const snapshot = resolveSettingsGraphSubstrateCanarySceneSnapshot(
      [
        {
          sectionId: "section-a",
          position: { x: 120, y: 80 },
          width: null,
          height: null,
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
        },
      ],
      {},
      null,
      null,
    );

    expect(snapshot.sections[0]?.resolvedSize).toBeNull();
    expect(snapshot.sections[0]?.sceneBoundsSize).toBeNull();
    expect(snapshot.sceneBounds).toBeNull();
  });

  it("keeps size-authority none measurements local while scene bounds stay unresolved", () => {
    const snapshot = resolveSettingsGraphSubstrateCanarySceneSnapshot(
      [
        {
          sectionId: "section-a",
          position: { x: 120, y: 80 },
          width: null,
          height: null,
          sizeAuthority: "none",
          zIndex: 2,
          tempZIndex: 2,
          positionAndSizeLocked: false,
        },
      ],
      {
        "section-a": { width: 280, height: 190 },
      },
      null,
      null,
    );

    expect(snapshot.sections[0]).toEqual({
      sectionId: "section-a",
      position: { x: 120, y: 80 },
      renderedPosition: { x: 120, y: 80 },
      width: null,
      height: null,
      sizeAuthority: "none",
      resolvedSize: { width: 280, height: 190 },
      sceneBoundsSize: null,
      zIndex: 2,
      tempZIndex: 2,
      positionAndSizeLocked: false,
    });
    expect(snapshot.sceneBounds).toBeNull();
  });
});
