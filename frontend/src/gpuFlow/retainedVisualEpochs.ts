import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import type {
  CommittedRetainedTexturePage,
  RetainedTexturePageDescriptor,
} from "./retainedTexturePages";
import type { RetainedDrawRegion } from "./retainedVisibleCoveragePlanner";
import type { GpuRect } from "./viewportMath";

export type RetainedVisualEpochKind = "base" | "active-dom";

type RetainedPageHandle = {
  readonly key: string;
  readonly page: CommittedRetainedTexturePage<RetainedContentTextureResources>;
};

export type RetainedVisualEpoch = {
  readonly committedCoverage: readonly GpuRect[];
  readonly contentVersion: string;
  readonly dpr: number;
  readonly generation: number;
  readonly kind: RetainedVisualEpochKind;
  readonly layoutVersion: number;
  readonly pages: readonly RetainedPageHandle[];
  readonly styleKey: string;
  readonly surfaceId: string;
  readonly zoomBucket: number;
};

function retainedVisualEpochKindForDescriptor(
  descriptor: Pick<RetainedTexturePageDescriptor, "visualEpochKind">,
): Exclude<RetainedVisualEpochKind, "active-dom"> {
  return descriptor.visualEpochKind ?? "base";
}

export function normalizeRetainedTexturePageVisualEpochKind(
  visualEpochKind: Exclude<RetainedVisualEpochKind, "active-dom"> | undefined,
): Exclude<RetainedVisualEpochKind, "active-dom"> {
  if (visualEpochKind === undefined) {
    return "base";
  }
  if (visualEpochKind !== "base") {
    throw new Error(
      `Retained texture page visualEpochKind "${visualEpochKind}" is not supported for texture pages.`,
    );
  }
  return visualEpochKind;
}

export function createRetainedVisualEpochsFromDrawRegions(
  drawRegions: readonly RetainedDrawRegion<RetainedContentTextureResources>[],
): readonly RetainedVisualEpoch[] {
  const epochsByKey = new Map<string, MutableRetainedVisualEpoch>();
  for (const drawRegion of drawRegions) {
    const descriptor = drawRegion.page.descriptor;
    const kind = retainedVisualEpochKindForDescriptor(descriptor);
    const key = [
      descriptor.surfaceId,
      kind,
      descriptor.viewportZoomBucket,
      descriptor.devicePixelRatioBucket,
      descriptor.sourceVersion,
      descriptor.contentVersion,
    ].join("|");
    const epoch =
      epochsByKey.get(key) ??
      createMutableRetainedVisualEpoch({
        descriptor,
        generation: drawRegion.page.committedFrame,
        kind,
      });
    epoch.committedCoverage.push(freezeRect(drawRegion.sampleRectCss));
    epoch.generation = Math.max(
      epoch.generation,
      drawRegion.page.committedFrame,
    );
    epoch.pages.push(
      Object.freeze({
        key: drawRegion.page.key,
        page: drawRegion.page,
      }),
    );
    epochsByKey.set(key, epoch);
  }
  return Object.freeze(
    [...epochsByKey.values()].map((epoch) =>
      Object.freeze({
        ...epoch,
        committedCoverage: Object.freeze(epoch.committedCoverage),
        pages: Object.freeze(epoch.pages),
      }),
    ),
  );
}

type MutableRetainedVisualEpoch = {
  committedCoverage: GpuRect[];
  readonly contentVersion: string;
  readonly dpr: number;
  generation: number;
  readonly kind: Exclude<RetainedVisualEpochKind, "active-dom">;
  readonly layoutVersion: number;
  pages: RetainedPageHandle[];
  readonly styleKey: string;
  readonly surfaceId: string;
  readonly zoomBucket: number;
};

function createMutableRetainedVisualEpoch({
  descriptor,
  generation,
  kind,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly generation: number;
  readonly kind: Exclude<RetainedVisualEpochKind, "active-dom">;
}): MutableRetainedVisualEpoch {
  return {
    committedCoverage: [],
    contentVersion: String(descriptor.contentVersion),
    dpr: descriptor.devicePixelRatioBucket,
    generation,
    kind,
    layoutVersion: descriptor.sourceVersion,
    pages: [],
    styleKey: `theme:${descriptor.sourceVersion}`,
    surfaceId: descriptor.surfaceId,
    zoomBucket: descriptor.viewportZoomBucket,
  };
}

function freezeRect(rect: GpuRect): GpuRect {
  return Object.freeze({ ...rect });
}
