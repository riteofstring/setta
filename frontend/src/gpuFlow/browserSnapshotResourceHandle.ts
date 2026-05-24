import { getGpuRetainedDomControlResolvedSnapshotSurfaceId } from "./GpuFlow/retainedDomControlSources";
import type { CommittedHtmlSurfaceTextureSnapshot } from "./htmlSurfaces/textures";
import type { GpuRetainedDomControlSourceDescriptor } from "./retainedDomControlScene";
import type { SurfaceResourceHandle } from "./surfaceCompositor/surfaceCoverage";

type DomControlSnapshotResourceDescriptor = Pick<
  GpuRetainedDomControlSourceDescriptor,
  | "sectionScrollRevision"
  | "snapshotCacheKeyRevision"
  | "snapshotSurfaceId"
  | "sourceId"
  | "sourceRectCssPx"
  | "viewportRectCssPx"
  | "viewportSampleRevision"
>;

type DomControlSnapshotTextureVersion = Pick<
  CommittedHtmlSurfaceTextureSnapshot,
  | "cssHeight"
  | "cssWidth"
  | "lastUploadFrame"
  | "pixelHeight"
  | "pixelWidth"
  | "textureContentKey"
  | "zoomBucket"
>;

export function createGpuFlowDomControlSnapshotResourceHandle({
  control,
  texture,
}: {
  readonly control: DomControlSnapshotResourceDescriptor;
  readonly texture?: DomControlSnapshotTextureVersion | null | undefined;
}): SurfaceResourceHandle {
  const surfaceId = getGpuRetainedDomControlResolvedSnapshotSurfaceId(control);
  return Object.freeze({
    actorId: control.sourceId,
    contentGenerationId: control.snapshotCacheKeyRevision,
    id: surfaceId,
    kind: "texture" as const,
    projectionGenerationId:
      createGpuFlowDomControlSnapshotProjectionGenerationId(control),
    resourceGenerationId: createGpuFlowDomControlSnapshotResourceGenerationId({
      control,
      surfaceId,
      texture,
    }),
  });
}

function createGpuFlowDomControlSnapshotProjectionGenerationId(
  control: DomControlSnapshotResourceDescriptor,
): string {
  return JSON.stringify({
    sectionScrollRevision: control.sectionScrollRevision,
    sourceRectCssPx: control.sourceRectCssPx,
    viewportRectCssPx: control.viewportRectCssPx,
    viewportSampleRevision: control.viewportSampleRevision,
  });
}

function createGpuFlowDomControlSnapshotResourceGenerationId({
  control,
  surfaceId,
  texture,
}: {
  readonly control: DomControlSnapshotResourceDescriptor;
  readonly surfaceId: string;
  readonly texture: DomControlSnapshotTextureVersion | null | undefined;
}): string {
  const textureVersion = normalizeGpuFlowDomControlSnapshotTextureVersion({
    control,
    texture,
  });
  return JSON.stringify({
    actorId: control.sourceId,
    contentGenerationId: control.snapshotCacheKeyRevision,
    surfaceId,
    ...textureVersion,
  });
}

function normalizeGpuFlowDomControlSnapshotTextureVersion({
  control,
  texture,
}: {
  readonly control: DomControlSnapshotResourceDescriptor;
  readonly texture: DomControlSnapshotTextureVersion | null | undefined;
}) {
  if (texture) {
    return {
      cssHeight: texture.cssHeight,
      cssWidth: texture.cssWidth,
      lastUploadFrame: texture.lastUploadFrame,
      pixelHeight: texture.pixelHeight,
      pixelWidth: texture.pixelWidth,
      textureContentKey:
        texture.textureContentKey ?? control.snapshotCacheKeyRevision,
      zoomBucket: texture.zoomBucket,
    };
  }
  return {
    cssHeight: control.sourceRectCssPx.height,
    cssWidth: control.sourceRectCssPx.width,
    lastUploadFrame: null,
    pixelHeight: null,
    pixelWidth: null,
    textureContentKey: control.snapshotCacheKeyRevision,
    zoomBucket: null,
  };
}
