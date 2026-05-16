import type { GpuRect } from "./viewportMath";

export type RetainedCompatibilityRejectReason =
  | "surface-mismatch"
  | "source-version-mismatch"
  | "row-version-mismatch"
  | "theme-mismatch"
  | "active-passive-state-mismatch"
  | "content-rect-mapping-mismatch";

export type RetainedFidelityState =
  | "target"
  | "compatible-lower-lod"
  | "compatible-previous-grid"
  | "compatible-previous-dpr-bucket"
  | "refining";

export type RetainedCompatibilityResult =
  | {
      readonly fidelity: Exclude<RetainedFidelityState, "refining">;
      readonly kind: "compatible";
    }
  | {
      readonly kind: "incompatible";
      readonly reason: RetainedCompatibilityRejectReason;
    };

export type RetainedSemanticIdentity = {
  readonly contentVersion: number;
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly surfaceId: string;
};

export type RetainedLod = {
  readonly level: number;
  readonly scale: number;
  readonly scaleKey: string;
};

export type RetainedDprBucket = number;

export type RetainedContentToTextureTransform = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type RetainedContentSnapshot = {
  readonly contentRect: GpuRect;
  readonly dprBucket: RetainedDprBucket;
  readonly lod: RetainedLod;
  readonly pageGridGeneration: string;
  readonly semanticIdentity: RetainedSemanticIdentity;
  readonly viewportZoomBucket: number;
};

export type RetainedCommittedPageLifecycle = {
  readonly contentRect: GpuRect;
  readonly contentToTextureTransform: RetainedContentToTextureTransform;
  readonly dprBucket: RetainedDprBucket;
  readonly lod: RetainedLod;
  readonly pageGridGeneration: string;
  readonly semanticIdentity: RetainedSemanticIdentity;
  readonly sourceCaptureRect: GpuRect;
  readonly viewportZoomBucket: number;
};

export type RetainedCommittedPageForCompatibility =
  RetainedCommittedPageLifecycle & {
    readonly key: string;
  };

export type RetainedPageLifecycleDescriptor = {
  readonly contentVersion: number;
  readonly devicePixelRatioBucket: number;
  readonly lodLevel: number;
  readonly lodScale: number;
  readonly scaleKey: string;
  readonly sourceKey: string;
  readonly sourceRectCss: GpuRect;
  readonly sourceVersion: number;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly tileColumn: number;
  readonly tileRow: number;
  readonly viewportZoomBucket: number;
};

export function createRetainedContentSnapshot(
  descriptor: RetainedPageLifecycleDescriptor,
): RetainedContentSnapshot {
  return Object.freeze({
    contentRect: freezeRect(descriptor.sourceRectCss),
    dprBucket: descriptor.devicePixelRatioBucket,
    lod: createRetainedLod(descriptor),
    pageGridGeneration: retainedPageGridGeneration(descriptor),
    semanticIdentity: createRetainedSemanticIdentity(descriptor),
    viewportZoomBucket: descriptor.viewportZoomBucket,
  });
}

export function createRetainedCommittedPageLifecycle(
  descriptor: RetainedPageLifecycleDescriptor,
): RetainedCommittedPageLifecycle {
  return Object.freeze({
    contentRect: freezeRect(descriptor.sourceRectCss),
    contentToTextureTransform: createRetainedContentToTextureTransform(
      descriptor.sourceRectCss,
    ),
    dprBucket: descriptor.devicePixelRatioBucket,
    lod: createRetainedLod(descriptor),
    pageGridGeneration: retainedPageGridGeneration(descriptor),
    semanticIdentity: createRetainedSemanticIdentity(descriptor),
    sourceCaptureRect: freezeRect(descriptor.sourceWindowCss),
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
  const pageIdentity = page.semanticIdentity;
  const snapshotIdentity = snapshot.semanticIdentity;
  if (pageIdentity.surfaceId !== snapshotIdentity.surfaceId) {
    return incompatible("surface-mismatch");
  }
  if (pageIdentity.sourceKey !== snapshotIdentity.sourceKey) {
    return incompatible("source-version-mismatch");
  }
  if (pageIdentity.sourceVersion !== snapshotIdentity.sourceVersion) {
    return incompatible("source-version-mismatch");
  }
  if (pageIdentity.contentVersion !== snapshotIdentity.contentVersion) {
    return incompatible("row-version-mismatch");
  }
  if (!hasValidContentMapping(page, visibleRegion)) {
    return incompatible("content-rect-mapping-mismatch");
  }
  return {
    fidelity: resolveRetainedFidelityState(page, snapshot),
    kind: "compatible",
  };
}

export function retainedContentRectToTextureRect(
  page: RetainedCommittedPageLifecycle,
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
): Exclude<RetainedFidelityState, "refining"> {
  if (page.lod.level !== snapshot.lod.level) {
    return "compatible-lower-lod";
  }
  if (page.dprBucket !== snapshot.dprBucket) {
    return "compatible-previous-dpr-bucket";
  }
  if (page.pageGridGeneration !== snapshot.pageGridGeneration) {
    return "compatible-previous-grid";
  }
  return "target";
}

function hasValidContentMapping(
  page: RetainedCommittedPageLifecycle,
  visibleRegion: GpuRect,
): boolean {
  return (
    page.contentToTextureTransform.every((value) => Number.isFinite(value)) &&
    intersectRects(page.contentRect, visibleRegion) !== null
  );
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

function incompatible(
  reason: RetainedCompatibilityRejectReason,
): RetainedCompatibilityResult {
  return { kind: "incompatible", reason };
}

function intersectRects(left: GpuRect, right: GpuRect): GpuRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - x,
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - y,
  );
  return width > 0 && height > 0 ? { height, width, x, y } : null;
}

function freezeRect(rect: GpuRect): GpuRect {
  return Object.freeze({ ...rect });
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
