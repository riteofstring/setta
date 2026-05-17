import { combineRetainedContentTexturePageFidelityState } from "./retainedContentTexturePageManagerHelpers";
import type {
  RetainedContentTexturePageFrameSurface,
  RetainedContentTexturePagePreparedFrame,
  RetainedContentTexturePageReplacementDescriptor,
} from "./retainedContentTexturePageManagerTypes";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import {
  RetainedTexturePageCache,
  retainedTexturePageKey,
  type RetainedTexturePageDescriptor,
  type RetainedTexturePageRejectedCoverage,
} from "./retainedTexturePages";
import { createRetainedDrawRegionFlatVisuals } from "./retainedTexturePageVisuals";
import {
  planRetainedVisibleCoverage,
  type RetainedReplacementRequest,
} from "./retainedVisibleCoveragePlanner";
import { createRetainedVisualEpochsFromDrawRegions } from "./retainedVisualEpochs";
import type { GpuRect } from "./viewportMath";

export type RetainedContentTexturePageVisibleCoverageFrame = Omit<
  RetainedContentTexturePagePreparedFrame,
  "frame"
>;

type RetainedTexturePageDescriptorFactory = ({
  lodScale,
  sourceRect,
  surface,
  visualEpochKind,
}: {
  readonly lodScale?: number | undefined;
  readonly sourceRect: GpuRect;
  readonly surface: RetainedContentTexturePageFrameSurface;
  readonly visualEpochKind?:
    | RetainedTexturePageDescriptor["visualEpochKind"]
    | undefined;
}) => readonly RetainedTexturePageDescriptor[];

export function createRetainedContentTexturePageVisibleCoverageFrame({
  cache,
  createPageDescriptors,
  frame,
  frameSurfaceById,
  visibleRegionTargets,
}: {
  readonly cache: RetainedTexturePageCache<RetainedContentTextureResources>;
  readonly createPageDescriptors: RetainedTexturePageDescriptorFactory;
  readonly frame: number;
  readonly frameSurfaceById: ReadonlyMap<
    string,
    RetainedContentTexturePageFrameSurface
  >;
  readonly visibleRegionTargets: RetainedContentTexturePagePreparedFrame["visibleRegionTargets"];
}): RetainedContentTexturePageVisibleCoverageFrame {
  const coveragePlan = planRetainedVisibleCoverage({
    cache,
    frame,
    targets: visibleRegionTargets,
  });
  const replacementDescriptors = createReplacementRequestDescriptors({
    createPageDescriptors,
    frameSurfaceById,
    replacementRequests: coveragePlan.replacementRequests,
  });
  const refinementDescriptors = replacementDescriptors.map(
    ({ descriptor }) => descriptor,
  );

  return {
    compatibleDrawQuadCount: coveragePlan.drawRegions.filter(
      (drawRegion) => drawRegion.coverageKind === "compatible",
    ).length,
    coverageCandidateCount: coveragePlan.diagnostics.cost.candidateCount,
    coveragePlan,
    drawQuadCount: coveragePlan.drawRegions.length,
    drawRegions: coveragePlan.drawRegions,
    fidelityState: resolveVisibleCoverageFidelityState(coveragePlan),
    flatSurfaces: createRetainedDrawRegionFlatVisuals({
      drawRegions: coveragePlan.drawRegions,
    }),
    mergedDrawQuadCount: 0,
    protectedPageKeys: coveragePlan.protectedPageKeys,
    refinementDescriptors,
    refinementPageCount: refinementDescriptors.length,
    rejectedStaleRectCount: sumRecordValues(
      coveragePlan.proof.rejectedCoverageCountByReason,
    ),
    rejectedStaleRects: coveragePlan.diagnostics.sampledRejectedCoverage.map(
      (entry) => ({
        reason: entry.reason as RetainedTexturePageRejectedCoverage["reason"],
        rect: entry.rect,
      }),
    ),
    replacementDescriptors,
    replacementRequests: coveragePlan.replacementRequests,
    trueHoleRectCount: coveragePlan.trueHoles.length,
    trueHoleRectsCss: coveragePlan.trueHoles,
    trueHoleVisuals: [],
    visibleRegionTargets,
    visualEpochs: createRetainedVisualEpochsFromDrawRegions(
      coveragePlan.drawRegions,
    ),
  };
}

function createReplacementRequestDescriptors({
  createPageDescriptors,
  frameSurfaceById,
  replacementRequests,
}: {
  readonly createPageDescriptors: RetainedTexturePageDescriptorFactory;
  readonly frameSurfaceById: ReadonlyMap<
    string,
    RetainedContentTexturePageFrameSurface
  >;
  readonly replacementRequests: readonly RetainedReplacementRequest[];
}): readonly RetainedContentTexturePageReplacementDescriptor[] {
  const descriptorsByKey = new Map<
    string,
    RetainedContentTexturePageReplacementDescriptor
  >();
  for (const request of replacementRequests) {
    const surface = frameSurfaceById.get(request.target.manifest.surfaceId);
    if (!surface) {
      continue;
    }
    const descriptors = createPageDescriptors({
      lodScale: request.target.fidelity.lodScale,
      sourceRect: request.target.contentRect,
      surface,
      visualEpochKind: "base",
    });
    for (const descriptor of descriptors) {
      const descriptorKey = retainedTexturePageKey(descriptor);
      descriptorsByKey.set(descriptorKey, {
        descriptor,
        replacementRequest: request,
      });
    }
  }
  return [...descriptorsByKey.values()];
}

function resolveVisibleCoverageFidelityState(
  coveragePlan: RetainedContentTexturePagePreparedFrame["coveragePlan"],
): RetainedContentTexturePagePreparedFrame["fidelityState"] {
  let fidelityState: RetainedContentTexturePagePreparedFrame["fidelityState"] =
    "target";
  for (const drawRegion of coveragePlan.drawRegions) {
    fidelityState = combineRetainedContentTexturePageFidelityState(
      fidelityState,
      drawRegion.fidelityState,
    );
  }
  if (coveragePlan.trueHoles.length > 0) {
    fidelityState = combineRetainedContentTexturePageFidelityState(
      fidelityState,
      "refining",
    );
  }
  return fidelityState;
}

function sumRecordValues(record: Readonly<Record<string, number>>): number {
  return Object.values(record).reduce((total, value) => total + value, 0);
}
