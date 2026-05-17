import {
  useCallback,
  useLayoutEffect,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from "react";

import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  clearGpuNodeDomTransformSyncCacheNode,
  type GpuHtmlSurfaceOverlayLayout,
  type GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import { HTML_SURFACE_CAPTURE_ONLY_SOURCE_ATTRIBUTE } from "../htmlSurfaces/sourceDom";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "../htmlSurfaces/sourceLayer";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowDomControlRenderer } from "./domControlPlane";
import { projectGpuFlowDomControlPlaneGeometry } from "./domControlPlaneProjection";
import { getGpuRetainedDomControlSnapshotSurfaceId } from "./retainedDomControlSources";

const GPU_RETAINED_DOM_CONTROL_SNAPSHOT_SOURCE_CLASS_NAME =
  "setta-gpu-flow__dom-control-snapshot-source";
const GPU_RETAINED_DOM_CONTROL_SNAPSHOT_SURFACE_ID_PREFIX =
  "retained-dom-control-snapshot:";
const GPU_RETAINED_DOM_CONTROL_SNAPSHOT_SOURCE_BATCH_SIZE = 2;

export function useGpuFlowRetainedDomControlSnapshotSources({
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  renderControl,
  retainedRuntimeFrame,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
}: {
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly renderControl: GpuFlowDomControlRenderer | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
}): {
  readonly retainedDomControlSnapshotSourceElement: ReactNode;
  readonly retainedDomControlSnapshotSurfaces: readonly GpuHtmlSurfaceOverlayLayout[];
} {
  const snapshotSources = useMemo(
    () =>
      getGpuRetainedDomControlSnapshotSources(
        retainedRuntimeFrame?.descriptors.domControlSources,
      ),
    [retainedRuntimeFrame],
  );
  const retainedDomControlSnapshotSurfaces = useMemo(
    () => getGpuRetainedDomControlSnapshotSurfaceLayouts(snapshotSources),
    [snapshotSources],
  );
  const handleSnapshotElementChange = useCallback(
    (surfaceId: string, element: HTMLElement | null) => {
      clearGpuNodeDomTransformSyncCacheNode(
        nodeDomTransformSyncCacheRef.current,
        surfaceId,
      );
      if (!element) {
        nodeElementByIdRef.current.delete(surfaceId);
        transformOnlyPaintNodeIdsRef.current.delete(surfaceId);
        textureManagerRef.current?.destroySurfaceTexture(surfaceId);
        return;
      }
      nodeElementByIdRef.current.set(surfaceId, element);
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [
      nodeDomTransformSyncCacheRef,
      nodeElementByIdRef,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
    ],
  );
  const handleSnapshotDraw = useCallback(
    (surfaceId: string) => {
      textureManagerRef.current?.markSurfaceTextureDirty({
        content: true,
        reason: "content",
        requestPaint: false,
        surfaceId,
      });
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [surfaceRef, textureManagerRef],
  );

  return {
    retainedDomControlSnapshotSourceElement: (
      <GpuRetainedDomControlSnapshotSourceLayer
        onSnapshotDraw={handleSnapshotDraw}
        onSnapshotElementChange={handleSnapshotElementChange}
        renderControl={renderControl}
        sources={snapshotSources}
      />
    ),
    retainedDomControlSnapshotSurfaces,
  };
}

function getGpuRetainedDomControlSnapshotSources(
  controls: readonly GpuRetainedDomControlSourceDescriptor[] | undefined,
): readonly GpuRetainedDomControlSourceDescriptor[] {
  return (controls ?? []).filter(
    (control) =>
      control.visualPolicy === "snapshot" && control.snapshotSurfaceId,
  );
}

export function getGpuRetainedDomControlSnapshotSurfaceLayouts(
  controls: readonly GpuRetainedDomControlSourceDescriptor[],
  options: {
    readonly getRetainedScrollOffset?:
      | ((
          surfaceId: string,
        ) => { readonly x: number; readonly y: number } | null)
      | undefined;
  } = {},
): readonly GpuHtmlSurfaceOverlayLayout[] {
  return controls.map((control) =>
    toGpuRetainedDomControlSnapshotSurfaceLayout(control, options),
  );
}

export function projectGpuRetainedDomControlSnapshotSurfaceLayouts({
  controls,
  getRetainedScrollOffset,
  overlays,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly getRetainedScrollOffset:
    | ((surfaceId: string) => { readonly x: number; readonly y: number } | null)
    | undefined;
  readonly overlays: readonly GpuHtmlSurfaceOverlayLayout[] | undefined;
}): readonly GpuHtmlSurfaceOverlayLayout[] | undefined {
  const snapshotLayouts = getGpuRetainedDomControlSnapshotSurfaceLayouts(
    controls.filter(
      (control) =>
        control.visualPolicy === "snapshot" && control.snapshotSurfaceId,
    ),
    {
      getRetainedScrollOffset,
    },
  );
  if (snapshotLayouts.length === 0) {
    return overlays;
  }
  const snapshotLayoutBySurfaceId = new Map(
    snapshotLayouts.map((layout) => [layout.surfaceId, layout]),
  );
  const includedSurfaceIds = new Set<string>();
  const projectedOverlays = (overlays ?? []).flatMap((overlay) => {
    const snapshotLayout = snapshotLayoutBySurfaceId.get(overlay.surfaceId);
    if (!snapshotLayout) {
      return isGpuRetainedDomControlSnapshotOverlay(overlay) ? [] : [overlay];
    }
    includedSurfaceIds.add(snapshotLayout.surfaceId);
    return [snapshotLayout];
  });
  for (const snapshotLayout of snapshotLayouts) {
    if (!includedSurfaceIds.has(snapshotLayout.surfaceId)) {
      projectedOverlays.push(snapshotLayout);
    }
  }
  return projectedOverlays;
}

function isGpuRetainedDomControlSnapshotOverlay(
  overlay: GpuHtmlSurfaceOverlayLayout,
): boolean {
  return (
    overlay.actorKind === "dom-control" &&
    overlay.surfaceId.startsWith(
      GPU_RETAINED_DOM_CONTROL_SNAPSHOT_SURFACE_ID_PREFIX,
    )
  );
}

function GpuRetainedDomControlSnapshotSourceLayer({
  onSnapshotDraw,
  onSnapshotElementChange,
  renderControl,
  sources,
}: {
  readonly onSnapshotDraw?: ((surfaceId: string) => void) | undefined;
  readonly onSnapshotElementChange?:
    | ((surfaceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly renderControl: GpuFlowDomControlRenderer | undefined;
  readonly sources: readonly GpuRetainedDomControlSourceDescriptor[];
}) {
  if (!renderControl || sources.length === 0) {
    return null;
  }
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={
        configureGpuRetainedDomControlSnapshotSourceElement
      }
      getSourceId={getGpuRetainedDomControlSnapshotSourceId}
      onSourceElementChange={onSnapshotElementChange}
      progressiveBatchSize={GPU_RETAINED_DOM_CONTROL_SNAPSHOT_SOURCE_BATCH_SIZE}
      renderSource={(source) => (
        <GpuRetainedDomControlSnapshotSource
          onSnapshotDraw={onSnapshotDraw}
          renderControl={renderControl}
          source={source}
        />
      )}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_RETAINED_DOM_CONTROL_SNAPSHOT_SOURCE_CLASS_NAME}`}
      sources={sources}
    />
  );
}

function GpuRetainedDomControlSnapshotSource({
  onSnapshotDraw,
  renderControl,
  source,
}: {
  readonly onSnapshotDraw?: ((surfaceId: string) => void) | undefined;
  readonly renderControl: GpuFlowDomControlRenderer;
  readonly source: GpuRetainedDomControlSourceDescriptor;
}) {
  const surfaceId = getGpuRetainedDomControlSnapshotSourceId(source);
  useLayoutEffect(() => {
    onSnapshotDraw?.(surfaceId);
  }, [onSnapshotDraw, source.snapshotCacheKeyRevision, surfaceId]);
  return (
    <div
      aria-hidden="true"
      data-gpu-flow-retained-dom-control-snapshot-content="true"
      style={{
        height: source.sourceRectCssPx.height,
        overflow: "hidden",
        pointerEvents: "none",
        position: "relative",
        width: source.sourceRectCssPx.width,
      }}
    >
      {renderControl(source, {
        onActivate: undefined,
        presentation: "dom-control-plane",
      })}
    </div>
  );
}

function toGpuRetainedDomControlSnapshotSurfaceLayout(
  control: GpuRetainedDomControlSourceDescriptor,
  options: {
    readonly getRetainedScrollOffset?:
      | ((
          surfaceId: string,
        ) => { readonly x: number; readonly y: number } | null)
      | undefined;
  },
): GpuHtmlSurfaceOverlayLayout {
  const geometry = projectGpuFlowDomControlPlaneGeometry({
    control,
    getRetainedScrollOffset: options.getRetainedScrollOffset,
  });
  const clip = geometry.visibleClipFlowPx;
  return {
    actorKind: "dom-control",
    height: clip.height,
    layer: "page",
    surfaceId: getGpuRetainedDomControlSnapshotSourceId(control),
    textureContentKey: control.snapshotCacheKeyRevision,
    textureCssHeight: control.sourceRectCssPx.height,
    textureCssWidth: control.sourceRectCssPx.width,
    textureSourceRect: {
      height: clip.height,
      width: clip.width,
      x: clip.x - geometry.worldRectFlowPx.x,
      y: clip.y - geometry.worldRectFlowPx.y,
    },
    width: clip.width,
    x: clip.x,
    y: clip.y,
    zIndex: control.zOrder,
  };
}

function getGpuRetainedDomControlSnapshotSourceId(
  control: Pick<
    GpuRetainedDomControlSourceDescriptor,
    "snapshotSurfaceId" | "sourceId"
  >,
): string {
  return (
    control.snapshotSurfaceId ??
    getGpuRetainedDomControlSnapshotSurfaceId(control)
  );
}

function configureGpuRetainedDomControlSnapshotSourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuRetainedDomControlSourceDescriptor>) {
  host.dataset.gpuFlowDomControlSnapshotSource = "true";
  host.dataset.gpuFlowDomControlId = source.sourceId;
  host.setAttribute(HTML_SURFACE_CAPTURE_ONLY_SOURCE_ATTRIBUTE, "true");
  host.setAttribute("aria-hidden", "true");
  host.style.height = `${source.sourceRectCssPx.height}px`;
  host.style.pointerEvents = "none";
  host.style.width = `${source.sourceRectCssPx.width}px`;
  host.style.zIndex = "-1";
}
