import { describe, expect, it } from "vitest";

import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import { createRetainedTexturePageDescriptors } from "./retainedTexturePageGrid";
import {
  RetainedTexturePageCache,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";
import {
  createRetainedVisibleRegionTargets,
  planRetainedVisibleCoverage,
  type RetainedVisibleRegionSurface,
} from "./retainedVisibleCoveragePlanner";
import type { GpuRect } from "./viewportMath";

describe("retained visible coverage planner", () => {
  it("creates semantic visible targets instead of page-tile targets", () => {
    const surface = visibleSurface({
      contentBoundsCss: { height: 256, width: 256, x: 0, y: 0 },
      visibleSourceRectCss: { height: 256, width: 256, x: 0, y: 0 },
    });

    const targets = createRetainedVisibleRegionTargets({
      devicePixelRatioBucket: 1,
      lodScale: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    const pageDescriptors = createRetainedTexturePageDescriptors({
      contentBoundsCss: surface.contentBoundsCss,
      contentVersion: surface.contentVersion,
      devicePixelRatioBucket: 1,
      lodScale: 1,
      maxPagePixelSize: 64,
      sourceKey: surface.sourceKey,
      sourceVersion: surface.sourceVersion,
      sourceWindowCss: surface.sourceWindowCss,
      surfaceId: surface.surfaceId,
      visibleSourceRectCss: surface.visibleSourceRectCss,
      viewportZoomBucket: 1,
    });

    expect(pageDescriptors).toHaveLength(16);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.contentRect).toEqual(surface.visibleSourceRectCss);
  });

  it("plans draw regions and partitions coverage proof from committed regions", () => {
    const cache =
      new RetainedTexturePageCache<RetainedContentTextureResources>();
    const surface = visibleSurface();
    const descriptor = pageDescriptor({
      contentBoundsCss: surface.contentBoundsCss,
      contentVersion: surface.contentVersion,
      lodScale: 1,
      sourceKey: surface.sourceKey,
      sourceVersion: surface.sourceVersion,
      sourceWindowCss: surface.sourceWindowCss,
      surfaceId: surface.surfaceId,
      visibleSourceRectCss: surface.visibleSourceRectCss,
    });
    cache.commitPage({
      descriptor,
      frame: 1,
      resource: {} as RetainedContentTextureResources,
    });
    const targets = createRetainedVisibleRegionTargets({
      devicePixelRatioBucket: 1,
      lodScale: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });

    const plan = planRetainedVisibleCoverage({
      cache,
      frame: 2,
      targets,
    });

    expect(plan.drawRegions).toHaveLength(1);
    expect(plan.trueHoles).toEqual([]);
    expect(plan.replacementRequests).toEqual([]);
    expect(plan.proof).toMatchObject({
      compatibleCoveredAreaCssPx: 0,
      exactCoveredAreaCssPx: 10_000,
      trueHoleAreaCssPx: 0,
      visibleAreaCssPx: 10_000,
    });
    expect(
      plan.proof.exactCoveredAreaCssPx +
        plan.proof.compatibleCoveredAreaCssPx +
        plan.proof.trueHoleAreaCssPx,
    ).toBe(plan.proof.visibleAreaCssPx);
    expect(plan.diagnostics.cost).toMatchObject({
      allocatedDiagnosticRectCount: 0,
      drawRegionCount: 1,
      spatialQueryCount: 1,
      visibleRegionCount: 1,
      visibleRegionGroupCount: 1,
    });
  });

  it("keeps compatible lower-fidelity coverage drawable while requesting replacement", () => {
    const cache =
      new RetainedTexturePageCache<RetainedContentTextureResources>();
    const surface = visibleSurface();
    cache.commitPage({
      descriptor: pageDescriptor({
        contentBoundsCss: surface.contentBoundsCss,
        contentVersion: surface.contentVersion,
        lodScale: 1,
        sourceKey: surface.sourceKey,
        sourceVersion: surface.sourceVersion,
        sourceWindowCss: surface.sourceWindowCss,
        surfaceId: surface.surfaceId,
        visibleSourceRectCss: surface.visibleSourceRectCss,
      }),
      frame: 1,
      resource: {} as RetainedContentTextureResources,
    });
    const targets = createRetainedVisibleRegionTargets({
      devicePixelRatioBucket: 1,
      lodScale: 2,
      surfaces: [surface],
      viewportZoomBucket: 2,
    });

    const plan = planRetainedVisibleCoverage({
      cache,
      frame: 2,
      targets,
    });

    expect(plan.drawRegions).toEqual([
      expect.objectContaining({
        coverageKind: "compatible",
        fidelityState: "compatible-lower-lod",
      }),
    ]);
    expect(plan.trueHoles).toEqual([]);
    expect(plan.replacementRequests).toEqual([
      expect.objectContaining({
        priority: "visible-refinement",
        reason: "target-fidelity-missing",
      }),
    ]);
  });

  it("emits visible-hole replacement requests when no compatible coverage exists", () => {
    const cache =
      new RetainedTexturePageCache<RetainedContentTextureResources>();
    const surface = visibleSurface();
    const targets = createRetainedVisibleRegionTargets({
      devicePixelRatioBucket: 1,
      lodScale: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });

    const plan = planRetainedVisibleCoverage({
      cache,
      frame: 1,
      targets,
    });

    expect(plan.drawRegions).toEqual([]);
    expect(plan.trueHoles).toEqual([surface.visibleSourceRectCss]);
    expect(plan.replacementRequests).toEqual([
      expect.objectContaining({
        priority: "visible-hole",
        reason: "true-hole",
      }),
    ]);
  });

  it("keeps true-hole replacement requests attached to their owning surface when local rects overlap", () => {
    const cache =
      new RetainedTexturePageCache<RetainedContentTextureResources>();
    const firstSurface = visibleSurface({
      layout: surfaceLayout("surface-a"),
      sourceKey: "source-a",
      surfaceId: "surface-a",
    });
    const secondSurface = visibleSurface({
      layout: surfaceLayout("surface-b"),
      sourceKey: "source-b",
      surfaceId: "surface-b",
    });
    cache.commitPage({
      descriptor: pageDescriptor({
        contentBoundsCss: firstSurface.contentBoundsCss,
        contentVersion: firstSurface.contentVersion,
        lodScale: 1,
        sourceKey: firstSurface.sourceKey,
        sourceVersion: firstSurface.sourceVersion,
        sourceWindowCss: firstSurface.sourceWindowCss,
        surfaceId: firstSurface.surfaceId,
        visibleSourceRectCss: firstSurface.visibleSourceRectCss,
      }),
      frame: 1,
      resource: {} as RetainedContentTextureResources,
    });
    const targets = createRetainedVisibleRegionTargets({
      devicePixelRatioBucket: 1,
      lodScale: 1,
      surfaces: [firstSurface, secondSurface],
      viewportZoomBucket: 1,
    });

    const plan = planRetainedVisibleCoverage({
      cache,
      frame: 2,
      targets,
    });

    expect(
      plan.drawRegions.map(
        (drawRegion) => drawRegion.mappingProof.ownerManifest.surfaceId,
      ),
    ).toEqual(["surface-a"]);
    expect(plan.trueHoles).toEqual([secondSurface.visibleSourceRectCss]);
    expect(plan.replacementRequests).toEqual([
      expect.objectContaining({
        priority: "visible-hole",
        reason: "true-hole",
        target: expect.objectContaining({
          contentRect: secondSurface.visibleSourceRectCss,
          manifest: expect.objectContaining({
            documentId: "source-b",
            sectionId: "surface-b",
            surfaceId: "surface-b",
          }),
        }),
      }),
    ]);
  });
});

function visibleSurface(
  overrides: Partial<RetainedVisibleRegionSurface> = {},
): RetainedVisibleRegionSurface {
  return {
    contentBoundsCss: { height: 100, width: 100, x: 0, y: 0 },
    contentVersion: 1,
    layout: surfaceLayout("surface-a"),
    sourceKey: "source-a",
    sourceVersion: 1,
    sourceWindowCss: { height: 100, width: 100, x: 0, y: 0 },
    surfaceId: "surface-a",
    visibleSourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
    ...overrides,
  };
}

function surfaceLayout(
  surfaceId: string,
): RetainedVisibleRegionSurface["layout"] {
  return {
    height: 100,
    surfaceId,
    textureSourceRect: { height: 100, width: 100, x: 0, y: 0 },
    width: 100,
    x: 0,
    y: 0,
  };
}

function pageDescriptor({
  contentBoundsCss,
  contentVersion,
  lodScale,
  sourceKey,
  sourceVersion,
  sourceWindowCss,
  surfaceId,
  visibleSourceRectCss,
}: {
  readonly contentBoundsCss: GpuRect;
  readonly contentVersion: number;
  readonly lodScale: number;
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly visibleSourceRectCss: GpuRect;
}): RetainedTexturePageDescriptor {
  const descriptor = createRetainedTexturePageDescriptors({
    contentBoundsCss,
    contentVersion,
    devicePixelRatioBucket: 1,
    lodScale,
    maxPagePixelSize: Math.max(
      visibleSourceRectCss.width,
      visibleSourceRectCss.height,
    ),
    sourceKey,
    sourceVersion,
    sourceWindowCss,
    surfaceId,
    visibleSourceRectCss,
    viewportZoomBucket: lodScale,
  })[0];
  if (!descriptor) {
    throw new Error("Expected retained test page descriptor.");
  }
  return descriptor;
}
