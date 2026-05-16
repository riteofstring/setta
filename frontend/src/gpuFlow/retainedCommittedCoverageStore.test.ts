import { describe, expect, it } from "vitest";

import {
  RetainedCommittedCoverageMap,
  type Matrix3,
  type RetainedFidelityMetadata,
  type RetainedRegionManifest,
  type RetainedRegionTarget,
  type UploadedRetainedRegion,
} from "./retainedCommittedCoverageStore";
import type { GpuRect } from "./viewportMath";

const BASE_RECT: GpuRect = { height: 100, width: 100, x: 0, y: 0 };

function manifest(
  overrides: Partial<RetainedRegionManifest> = {},
): RetainedRegionManifest {
  const contentRect = overrides.contentRect ?? BASE_RECT;
  const clipRect = overrides.clipRect ?? contentRect;
  return {
    clipRect,
    contentRect,
    contentVersion: 1,
    documentId: "document",
    fontGeneration: 1,
    renderMode: "passive",
    rowId: "row-a",
    sectionId: "section",
    surfaceId: "surface",
    themeGeneration: 1,
    ...overrides,
  };
}

function fidelity(
  overrides: Partial<RetainedFidelityMetadata> = {},
): RetainedFidelityMetadata {
  return {
    devicePixelRatioBucket: 1,
    lodLevel: 0,
    lodScale: 1,
    pageGridGeneration: "grid-a",
    pixelHeight: 100,
    pixelWidth: 100,
    viewportZoomBucket: 1,
    ...overrides,
  };
}

function target({
  clipRect = BASE_RECT,
  contentRect = BASE_RECT,
  fidelityMetadata = fidelity(),
  manifestOverrides = {},
}: {
  readonly clipRect?: GpuRect | undefined;
  readonly contentRect?: GpuRect | undefined;
  readonly fidelityMetadata?: RetainedFidelityMetadata | undefined;
  readonly manifestOverrides?: Partial<RetainedRegionManifest> | undefined;
} = {}): RetainedRegionTarget {
  return {
    clipRect,
    contentRect,
    fidelity: fidelityMetadata,
    manifest: manifest({ clipRect, contentRect, ...manifestOverrides }),
    zLayer: 0,
  };
}

function uploaded({
  byteSize = 100,
  id = "region",
  regionTarget = target(),
  textureHandle = id,
}: {
  readonly byteSize?: number | undefined;
  readonly id?: string | undefined;
  readonly regionTarget?: RetainedRegionTarget | undefined;
  readonly textureHandle?: string | undefined;
} = {}): UploadedRetainedRegion<string> {
  return {
    byteSize,
    clipRect: regionTarget.clipRect,
    contentRect: regionTarget.contentRect,
    contentToTexture: contentToTexture(regionTarget.contentRect),
    fidelity: regionTarget.fidelity,
    generation: 0,
    id,
    manifest: regionTarget.manifest,
    textureHandle,
    zLayer: regionTarget.zLayer,
  };
}

describe("RetainedCommittedCoverageMap", () => {
  it("keeps committed content drawable across clip and source-window changes with mapping proof", () => {
    const store = new RetainedCommittedCoverageMap<string>();
    const originalTarget = target();
    const txn = store.beginReplacement(originalTarget);
    store.commitReplacement(txn, uploaded({ regionTarget: originalTarget }));

    const shiftedClipTarget = target({
      clipRect: { height: 100, width: 100, x: 0, y: 12 },
      contentRect: BASE_RECT,
    });

    expect(
      store.queryVisibleCoverage({ regions: [shiftedClipTarget] }),
    ).toEqual(
      expect.objectContaining({
        compatibleCoverage: [
          expect.objectContaining({
            compatibility: expect.objectContaining({
              fidelity: "compatible-mapped-region",
            }),
            coverageRect: BASE_RECT,
            region: expect.objectContaining({ id: "region" }),
          }),
        ],
        exactCoverage: [],
        uncoveredRegions: [],
      }),
    );
  });

  it("reports typed rejected coverage instead of drawing stale row content", () => {
    const store = new RetainedCommittedCoverageMap<string>();
    const originalTarget = target();
    store.commitReplacement(
      store.beginReplacement(originalTarget),
      uploaded({ regionTarget: originalTarget }),
    );

    const changedContent = target({
      manifestOverrides: { contentVersion: 2 },
    });

    expect(store.queryVisibleCoverage({ regions: [changedContent] })).toEqual(
      expect.objectContaining({
        compatibleCoverage: [],
        exactCoverage: [],
        rejectedCoverage: [
          {
            reason: "row-content-version-mismatch",
            rect: BASE_RECT,
          },
        ],
        uncoveredRegions: [BASE_RECT],
      }),
    );
  });

  it("rejects replacement commits whose manifest no longer matches the transaction target", () => {
    const store = new RetainedCommittedCoverageMap<string>();
    const originalTarget = target();
    const txn = store.beginReplacement(originalTarget);

    expect(() =>
      store.commitReplacement(
        txn,
        uploaded({
          regionTarget: target({
            manifestOverrides: { contentVersion: 2 },
          }),
        }),
      ),
    ).toThrow(/mismatched manifest/);
    expect(store.queryVisibleCoverage({ regions: [originalTarget] })).toEqual(
      expect.objectContaining({
        exactCoverage: [],
        uncoveredRegions: [BASE_RECT],
      }),
    );
  });

  it("protects visible compatible coverage from eviction until a replacement exists", () => {
    const store = new RetainedCommittedCoverageMap<string>();
    const visibleTarget = target({ contentRect: BASE_RECT });
    store.commitReplacement(
      store.beginReplacement(visibleTarget),
      uploaded({ byteSize: 100, id: "visible", regionTarget: visibleTarget }),
    );
    const offscreenTarget = target({
      contentRect: { height: 100, width: 100, x: 160, y: 0 },
    });
    store.commitReplacement(
      store.beginReplacement(offscreenTarget),
      uploaded({
        byteSize: 1_000,
        id: "offscreen",
        regionTarget: offscreenTarget,
      }),
    );

    expect(store.protectVisibleRegions({ regions: [visibleTarget] })).toEqual({
      protectedRegionCount: 1,
      protectedRegionIds: ["visible"],
    });
    expect(store.evictToBudget({ maxBytes: 100 })).toEqual({
      evictedBytes: 1_000,
      evictedRegionIds: ["offscreen"],
      remainingBytes: 100,
    });
    expect(store.queryVisibleCoverage({ regions: [visibleTarget] })).toEqual(
      expect.objectContaining({
        exactCoverage: [
          expect.objectContaining({
            region: expect.objectContaining({ id: "visible" }),
          }),
        ],
        uncoveredRegions: [],
      }),
    );
  });
});

function contentToTexture(rect: GpuRect): Matrix3 {
  return [
    1 / rect.width,
    0,
    -rect.x / rect.width,
    0,
    1 / rect.height,
    -rect.y / rect.height,
    0,
    0,
    1,
  ];
}
