import {
  evaluateRetainedRegionCompatibility,
  type Matrix3,
  type RetainedCommittedRegion,
  type RetainedFidelityMetadata,
  type RetainedRegionCompatibility,
  type RetainedRegionContentSegment,
  type RetainedRegionManifest,
  type RetainedRegionTarget,
  type RetainedRegionTextLikeSnapshot,
} from "./retainedCommittedCoverageStore";
import type { GpuRect } from "./viewportMath";

export type RetainedCompatibilityRejectReason = Extract<
  RetainedRegionCompatibility,
  { readonly kind: "incompatible" }
>["reason"];

export type RetainedFidelityState =
  | "target"
  | "compatible-lower-lod"
  | "compatible-previous-grid"
  | "compatible-previous-dpr-bucket"
  | "compatible-mapped-region"
  | "refining";

export type RetainedCompatibilityResult =
  | {
      readonly fidelity: Exclude<RetainedFidelityState, "refining">;
      readonly kind: "compatible";
      readonly regionCompatibility: Extract<
        RetainedRegionCompatibility,
        { readonly kind: "compatible" }
      >;
    }
  | {
      readonly kind: "incompatible";
      readonly reason: RetainedCompatibilityRejectReason;
    };

type RetainedSemanticIdentity = {
  readonly contentVersion: number;
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly surfaceId: string;
};

type RetainedLod = {
  readonly level: number;
  readonly scale: number;
  readonly scaleKey: string;
};

type RetainedDprBucket = number;

type RetainedContentToTextureTransform = Matrix3;

type RetainedContentSnapshot = {
  readonly contentRect: GpuRect;
  readonly dprBucket: RetainedDprBucket;
  readonly fidelityMetadata: RetainedFidelityMetadata;
  readonly lod: RetainedLod;
  readonly manifest: RetainedRegionManifest;
  readonly pageGridGeneration: string;
  readonly semanticIdentity: RetainedSemanticIdentity;
  readonly target: RetainedRegionTarget;
  readonly viewportZoomBucket: number;
};

export type RetainedCommittedPageLifecycle = {
  readonly clipRect: GpuRect;
  readonly contentRect: GpuRect;
  readonly contentToTextureTransform: RetainedContentToTextureTransform;
  readonly dprBucket: RetainedDprBucket;
  readonly fidelityMetadata: RetainedFidelityMetadata;
  readonly lod: RetainedLod;
  readonly manifest: RetainedRegionManifest;
  readonly pageGridGeneration: string;
  readonly semanticIdentity: RetainedSemanticIdentity;
  readonly sourceCaptureRect: GpuRect;
  readonly viewportZoomBucket: number;
};

type RetainedCommittedPageForCompatibility =
  RetainedCommittedPageLifecycle & {
    readonly key: string;
  };

type RetainedPageLifecycleDescriptor = {
  readonly contentVersion: number;
  readonly contentSegments?: readonly RetainedRegionContentSegment[];
  readonly devicePixelRatioBucket: number;
  readonly lodLevel: number;
  readonly lodScale: number;
  readonly pixelHeight?: number | undefined;
  readonly pixelWidth?: number | undefined;
  readonly scaleKey: string;
  readonly sourceKey: string;
  readonly sourceRectCss: GpuRect;
  readonly sourceVersion: number;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly textLikeSnapshots?: readonly RetainedRegionTextLikeSnapshot[];
  readonly tileColumn: number;
  readonly tileRow: number;
  readonly viewportZoomBucket: number;
};

export function createRetainedContentSnapshot(
  descriptor: RetainedPageLifecycleDescriptor,
): RetainedContentSnapshot {
  const manifest = createRetainedRegionManifest(descriptor);
  const fidelityMetadata = createRetainedFidelityMetadata(descriptor);
  return Object.freeze({
    contentRect: freezeRect(descriptor.sourceRectCss),
    dprBucket: descriptor.devicePixelRatioBucket,
    fidelityMetadata,
    lod: createRetainedLod(descriptor),
    manifest,
    pageGridGeneration: retainedPageGridGeneration(descriptor),
    semanticIdentity: createRetainedSemanticIdentity(descriptor),
    target: createRetainedRegionTargetFromDescriptor(descriptor),
    viewportZoomBucket: descriptor.viewportZoomBucket,
  });
}

export function createRetainedCommittedPageLifecycle(
  descriptor: RetainedPageLifecycleDescriptor,
): RetainedCommittedPageLifecycle {
  const manifest = createRetainedRegionManifest(descriptor);
  const fidelityMetadata = createRetainedFidelityMetadata(descriptor);
  return Object.freeze({
    clipRect: freezeRect(descriptor.sourceWindowCss),
    contentRect: freezeRect(descriptor.sourceRectCss),
    contentToTextureTransform: createRetainedContentToTextureTransform(
      descriptor.sourceRectCss,
    ),
    dprBucket: descriptor.devicePixelRatioBucket,
    fidelityMetadata,
    lod: createRetainedLod(descriptor),
    manifest,
    pageGridGeneration: retainedPageGridGeneration(descriptor),
    semanticIdentity: createRetainedSemanticIdentity(descriptor),
    sourceCaptureRect: freezeRect(descriptor.sourceWindowCss),
    viewportZoomBucket: descriptor.viewportZoomBucket,
  });
}

export function createRetainedCommittedRegionFromDescriptor<TTextureHandle>({
  descriptor,
  generation = 0,
  id,
  textureHandle,
  zLayer = 0,
}: {
  readonly descriptor: RetainedPageLifecycleDescriptor;
  readonly generation?: number | undefined;
  readonly id: string;
  readonly textureHandle: TTextureHandle;
  readonly zLayer?: number | undefined;
}): RetainedCommittedRegion<TTextureHandle> {
  const lifecycle = createRetainedCommittedPageLifecycle(descriptor);
  return Object.freeze({
    contentRect: lifecycle.contentRect,
    contentToTexture: lifecycle.contentToTextureTransform,
    clipRect: lifecycle.clipRect,
    fidelity: lifecycle.fidelityMetadata,
    generation,
    id,
    manifest: lifecycle.manifest,
    textureHandle,
    zLayer,
  });
}

export function createRetainedRegionTargetFromDescriptor(
  descriptor: RetainedPageLifecycleDescriptor,
): RetainedRegionTarget {
  return Object.freeze({
    clipRect: freezeRect(descriptor.sourceWindowCss),
    contentRect: freezeRect(descriptor.sourceRectCss),
    fidelity: createRetainedFidelityMetadata(descriptor),
    manifest: createRetainedRegionManifest(descriptor),
    zLayer: 0,
  });
}

function createRetainedRegionManifest(
  descriptor: RetainedPageLifecycleDescriptor,
): RetainedRegionManifest {
  return Object.freeze({
    clipRect: freezeRect(descriptor.sourceWindowCss),
    contentSegments: freezeContentSegments(descriptor.contentSegments ?? []),
    contentRect: freezeRect(descriptor.sourceRectCss),
    contentVersion: descriptor.contentVersion,
    documentId: descriptor.sourceKey,
    fontGeneration: 0,
    renderMode: "passive",
    rowId: null,
    sectionId: descriptor.surfaceId,
    surfaceId: descriptor.surfaceId,
    textLikeSnapshots: freezeTextLikeSnapshots(
      descriptor.textLikeSnapshots ?? [],
    ),
    themeGeneration: descriptor.sourceVersion,
  });
}

function createRetainedFidelityMetadata(
  descriptor: RetainedPageLifecycleDescriptor,
): RetainedFidelityMetadata {
  return Object.freeze({
    devicePixelRatioBucket: descriptor.devicePixelRatioBucket,
    lodLevel: descriptor.lodLevel,
    lodScale: descriptor.lodScale,
    pageGridGeneration: retainedPageGridGeneration(descriptor),
    pixelHeight: descriptor.pixelHeight ?? 1,
    pixelWidth: descriptor.pixelWidth ?? 1,
    viewportZoomBucket: descriptor.viewportZoomBucket,
  });
}

function createRetainedSemanticIdentity(
  descriptor: Pick<
    RetainedPageLifecycleDescriptor,
    "contentVersion" | "sourceKey" | "sourceVersion" | "surfaceId"
  >,
): RetainedSemanticIdentity {
  return Object.freeze({
    contentVersion: descriptor.contentVersion,
    sourceKey: descriptor.sourceKey,
    sourceVersion: descriptor.sourceVersion,
    surfaceId: descriptor.surfaceId,
  });
}

function retainedPageGridGeneration(
  descriptor: Pick<
    RetainedPageLifecycleDescriptor,
    | "devicePixelRatioBucket"
    | "lodLevel"
    | "scaleKey"
    | "sourceRectCss"
    | "tileColumn"
    | "tileRow"
    | "viewportZoomBucket"
  >,
): string {
  const rect = descriptor.sourceRectCss;
  return [
    descriptor.scaleKey,
    descriptor.lodLevel,
    descriptor.devicePixelRatioBucket,
    descriptor.viewportZoomBucket,
    descriptor.tileColumn,
    descriptor.tileRow,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  ].join(":");
}

export function isSemanticallyCompatibleRetainedPage(
  page: RetainedCommittedPageForCompatibility,
  snapshot: RetainedContentSnapshot,
  visibleRegion: GpuRect,
): RetainedCompatibilityResult {
  const compatibility = evaluateRetainedRegionCompatibility({
    candidate: {
      clipRect: page.clipRect,
      contentRect: page.contentRect,
      contentToTexture: page.contentToTextureTransform,
      fidelity: page.fidelityMetadata,
      manifest: page.manifest,
    },
    target: {
      ...snapshot.target,
      contentRect: visibleRegion,
    },
  });
  if (compatibility.kind === "incompatible") {
    return compatibility;
  }
  return {
    fidelity: resolveRetainedFidelityState(page, snapshot, compatibility),
    kind: "compatible",
    regionCompatibility: compatibility,
  };
}

export function retainedContentRectToTextureRect(
  page: Pick<RetainedCommittedPageLifecycle, "contentToTextureTransform">,
  contentRect: GpuRect,
): {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
} {
  const transform = page.contentToTextureTransform;
  const leftTop = transformPoint(transform, contentRect.x, contentRect.y);
  const rightBottom = transformPoint(
    transform,
    contentRect.x + contentRect.width,
    contentRect.y + contentRect.height,
  );
  return {
    u0: clampUnit(leftTop.x),
    u1: clampUnit(rightBottom.x),
    v0: clampUnit(leftTop.y),
    v1: clampUnit(rightBottom.y),
  };
}

function resolveRetainedFidelityState(
  page: RetainedCommittedPageLifecycle,
  snapshot: RetainedContentSnapshot,
  compatibility: Extract<
    RetainedRegionCompatibility,
    { readonly kind: "compatible" }
  >,
): Exclude<RetainedFidelityState, "refining"> {
  if (compatibility.fidelity === "exact") {
    return "target";
  }
  if (page.lod.level !== snapshot.lod.level) {
    return "compatible-lower-lod";
  }
  if (page.dprBucket !== snapshot.dprBucket) {
    return "compatible-previous-dpr-bucket";
  }
  if (compatibility.fidelity === "compatible-mapped-region") {
    return "compatible-mapped-region";
  }
  if (page.pageGridGeneration !== snapshot.pageGridGeneration) {
    return "compatible-previous-grid";
  }
  return "target";
}

function createRetainedLod(
  descriptor: Pick<
    RetainedPageLifecycleDescriptor,
    "lodLevel" | "lodScale" | "scaleKey"
  >,
): RetainedLod {
  return Object.freeze({
    level: descriptor.lodLevel,
    scale: descriptor.lodScale,
    scaleKey: descriptor.scaleKey,
  });
}

function createRetainedContentToTextureTransform(
  rect: GpuRect,
): RetainedContentToTextureTransform {
  return Object.freeze([
    1 / rect.width,
    0,
    -rect.x / rect.width,
    0,
    1 / rect.height,
    -rect.y / rect.height,
    0,
    0,
    1,
  ]);
}

function transformPoint(
  transform: RetainedContentToTextureTransform,
  x: number,
  y: number,
): { readonly x: number; readonly y: number } {
  return {
    x: transform[0] * x + transform[1] * y + transform[2],
    y: transform[3] * x + transform[4] * y + transform[5],
  };
}

function freezeRect(rect: GpuRect): GpuRect {
  return Object.freeze({ ...rect });
}

function freezeContentSegments(
  segments: readonly RetainedRegionContentSegment[],
): readonly RetainedRegionContentSegment[] {
  return Object.freeze(
    segments.map((segment) =>
      Object.freeze({
        ...segment,
        rectCss: freezeRect(segment.rectCss),
      }),
    ),
  );
}

function freezeTextLikeSnapshots(
  snapshots: readonly RetainedRegionTextLikeSnapshot[],
): readonly RetainedRegionTextLikeSnapshot[] {
  return Object.freeze(
    snapshots.map((snapshot) =>
      Object.freeze({
        ...snapshot,
        rectCss: freezeRect(snapshot.rectCss),
      }),
    ),
  );
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
