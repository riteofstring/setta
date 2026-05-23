import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode,
} from "react";

import type { GpuSurfaceHandle } from "../GpuSurface";
import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
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
import { releaseGpuFlowUnmountedSourceSurfaceTexture } from "../surfaceTextureReleaseAuthority";
import { getGpuFlowBrowserVisualActorRuntimeForCommittedSurface } from "./browserVisualActorRuntime";
import type { GpuFlowDomControlRenderer } from "./domControlPlane";
import { projectGpuFlowDomControlPlaneGeometry } from "./domControlPlaneProjection";
import { getGpuRetainedDomControlSnapshotSurfaceId } from "./retainedDomControlSources";

const GPU_RETAINED_DOM_CONTROL_SNAPSHOT_SOURCE_CLASS_NAME =
  "setta-gpu-flow__dom-control-snapshot-source";
const GPU_RETAINED_DOM_CONTROL_SNAPSHOT_SURFACE_ID_PREFIX =
  "retained-dom-control-snapshot:";
const GPU_RETAINED_DOM_CONTROL_SNAPSHOT_PROGRESSIVE_BATCH_SIZE = 1;
const GPU_RETAINED_DOM_CONTROL_SNAPSHOT_PROGRESSIVE_BATCH_DELAY_MS = 750;
const noop = () => {};
type GpuRetainedDomControlSnapshotSourceDiagnostic = {
  readonly expectedTextureContentKey: string;
  readonly inPreparation: boolean;
  readonly sourceId: string;
  readonly surfaceId: string;
  readonly texture: {
    readonly dirtyContent: boolean;
    readonly dirtyResolution: boolean;
    readonly lastUploadFrame: number;
    readonly textureContentKey: string | undefined;
    readonly textureContentKeyMatches: boolean;
  } | null;
};

export function useGpuFlowRetainedDomControlSnapshotSources({
  committedSurfaceRuntime,
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  renderControl,
  retainedRuntimeFrame,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
}: {
  readonly committedSurfaceRuntime?: GpuFlowCommittedSurfaceRuntime | undefined;
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
  const browserVisualRuntime = useMemo(
    () =>
      committedSurfaceRuntime
        ? getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
            committedSurfaceRuntime,
          )
        : null,
    [committedSurfaceRuntime],
  );
  const browserVisualTextureManager = useMemo(
    () => ({
      getCommittedSurfaceTexture: (surfaceId: string) =>
        textureManagerRef.current?.getCommittedSurfaceTexture(surfaceId),
    }),
    [textureManagerRef],
  );
  useLayoutEffect(() => {
    if (!browserVisualRuntime) {
      return;
    }
    browserVisualRuntime.setDomControlSnapshotTextureManager(
      browserVisualTextureManager,
    );
    return () => {
      browserVisualRuntime.setDomControlSnapshotTextureManager(null);
    };
  }, [browserVisualRuntime, browserVisualTextureManager]);
  const browserVisualSnapshot = useSyncExternalStore(
    useCallback(
      (listener) =>
        browserVisualRuntime ? browserVisualRuntime.subscribe(listener) : noop,
      [browserVisualRuntime],
    ),
    useCallback(
      () => browserVisualRuntime?.getSnapshot() ?? null,
      [browserVisualRuntime],
    ),
    useCallback(
      () => browserVisualRuntime?.getSnapshot() ?? null,
      [browserVisualRuntime],
    ),
  );
  const browserVisualPreparationSnapshot = useSyncExternalStore(
    useCallback(
      (listener) =>
        browserVisualRuntime
          ? browserVisualRuntime.subscribePreparation(listener)
          : noop,
      [browserVisualRuntime],
    ),
    useCallback(
      () => browserVisualRuntime?.getPreparationSnapshot() ?? null,
      [browserVisualRuntime],
    ),
    useCallback(
      () => browserVisualRuntime?.getPreparationSnapshot() ?? null,
      [browserVisualRuntime],
    ),
  );
  const snapshotSources = useMemo(() => {
    if (browserVisualRuntime) {
      return combineGpuFlowRetainedDomControlSnapshotSources([
        ...(browserVisualSnapshot?.domControls.snapshotControls ?? []),
        ...(browserVisualPreparationSnapshot?.domControls.snapshotControls ??
          []),
      ]);
    }
    return getGpuRetainedDomControlSnapshotSources(
      retainedRuntimeFrame?.descriptors.domControlSources,
    );
  }, [
    browserVisualRuntime,
    browserVisualPreparationSnapshot,
    browserVisualSnapshot,
    retainedRuntimeFrame,
  ]);
  const preparationSnapshotSourceIds = useMemo(
    () =>
      browserVisualRuntime
        ? new Set(
            (
              browserVisualPreparationSnapshot?.domControls.snapshotControls ??
              []
            ).map(getGpuRetainedDomControlSnapshotSourceId),
          )
        : undefined,
    [browserVisualPreparationSnapshot, browserVisualRuntime],
  );
  const retainedDomControlSnapshotSurfaces = useMemo(
    () => getGpuRetainedDomControlSnapshotSurfaceLayouts(snapshotSources),
    [snapshotSources],
  );
  useLayoutEffect(() => {
    const view = window as typeof window & {
      __settaGpuFlowDomControlSnapshotSourceDiagnostics?:
        | (() => readonly GpuRetainedDomControlSnapshotSourceDiagnostic[])
        | undefined;
    };
    view.__settaGpuFlowDomControlSnapshotSourceDiagnostics = () =>
      snapshotSources.map((source) => {
        const surfaceId = getGpuRetainedDomControlSnapshotSourceId(source);
        const texture =
          textureManagerRef.current?.getCommittedSurfaceTexture(surfaceId) ??
          null;
        return {
          expectedTextureContentKey: source.snapshotCacheKeyRevision,
          inPreparation: preparationSnapshotSourceIds?.has(surfaceId) === true,
          sourceId: source.sourceId,
          surfaceId,
          texture: texture
            ? {
                dirtyContent: texture.dirtyContent,
                dirtyResolution: texture.dirtyResolution,
                lastUploadFrame: texture.lastUploadFrame,
                textureContentKey: texture.textureContentKey,
                textureContentKeyMatches:
                  texture.textureContentKey === source.snapshotCacheKeyRevision,
              }
            : null,
        };
      });
    return () => {
      if (view.__settaGpuFlowDomControlSnapshotSourceDiagnostics) {
        delete view.__settaGpuFlowDomControlSnapshotSourceDiagnostics;
      }
    };
  }, [preparationSnapshotSourceIds, snapshotSources, textureManagerRef]);
  const handleSnapshotElementChange = useCallback(
    (surfaceId: string, element: HTMLElement | null) => {
      clearGpuNodeDomTransformSyncCacheNode(
        nodeDomTransformSyncCacheRef.current,
        surfaceId,
      );
      if (!element) {
        nodeElementByIdRef.current.delete(surfaceId);
        transformOnlyPaintNodeIdsRef.current.delete(surfaceId);
        releaseGpuFlowUnmountedSourceSurfaceTexture({
          surfaceId,
          textureManager: textureManagerRef.current,
        });
        registerGpuFlowRetainedDomControlSnapshotTextureManager({
          committedSurfaceRuntime,
          textureManager: browserVisualTextureManager,
        });
        registerGpuFlowRetainedDomControlSnapshotElement({
          committedSurfaceRuntime,
          element: null,
          surfaceId,
        });
        return;
      }
      nodeElementByIdRef.current.set(surfaceId, element);
      registerGpuFlowRetainedDomControlSnapshotTextureManager({
        committedSurfaceRuntime,
        textureManager: browserVisualTextureManager,
      });
      registerGpuFlowRetainedDomControlSnapshotElement({
        committedSurfaceRuntime,
        element,
        surfaceId,
      });
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [
      browserVisualTextureManager,
      committedSurfaceRuntime,
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
      registerGpuFlowRetainedDomControlSnapshotTextureManager({
        committedSurfaceRuntime,
        textureManager: browserVisualTextureManager,
      });
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [
      browserVisualTextureManager,
      committedSurfaceRuntime,
      surfaceRef,
      textureManagerRef,
    ],
  );

  return {
    retainedDomControlSnapshotSourceElement: (
      <GpuRetainedDomControlSnapshotSourceLayer
        onSnapshotDraw={handleSnapshotDraw}
        onSnapshotElementChange={handleSnapshotElementChange}
        prioritySourceIds={preparationSnapshotSourceIds}
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

function combineGpuFlowRetainedDomControlSnapshotSources(
  controls: readonly GpuRetainedDomControlSourceDescriptor[],
): readonly GpuRetainedDomControlSourceDescriptor[] {
  const controlBySourceId = new Map<
    string,
    GpuRetainedDomControlSourceDescriptor
  >();
  for (const control of controls) {
    controlBySourceId.set(control.sourceId, control);
  }
  return Object.freeze([...controlBySourceId.values()]);
}

function registerGpuFlowRetainedDomControlSnapshotElement({
  committedSurfaceRuntime,
  element,
  surfaceId,
}: {
  readonly committedSurfaceRuntime?: GpuFlowCommittedSurfaceRuntime | undefined;
  readonly element: HTMLElement | null;
  readonly surfaceId: string;
}): void {
  if (!committedSurfaceRuntime) {
    return;
  }
  getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
    committedSurfaceRuntime,
  ).setDomControlSnapshotElement({
    element,
    surfaceId,
  });
}

function registerGpuFlowRetainedDomControlSnapshotTextureManager({
  committedSurfaceRuntime,
  textureManager,
}: {
  readonly committedSurfaceRuntime?: GpuFlowCommittedSurfaceRuntime | undefined;
  readonly textureManager: Pick<
    HtmlSurfaceTextureManager,
    "getCommittedSurfaceTexture"
  > | null;
}): void {
  if (!committedSurfaceRuntime) {
    return;
  }
  getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
    committedSurfaceRuntime,
  ).setDomControlSnapshotTextureManager(textureManager);
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
  prioritySourceIds,
  renderControl,
  sources,
}: {
  readonly onSnapshotDraw?: ((surfaceId: string) => void) | undefined;
  readonly onSnapshotElementChange?:
    | ((surfaceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly prioritySourceIds?: ReadonlySet<string> | undefined;
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
      prioritySourceIds={prioritySourceIds}
      progressiveBatchDelayMs={
        GPU_RETAINED_DOM_CONTROL_SNAPSHOT_PROGRESSIVE_BATCH_DELAY_MS
      }
      progressiveBatchSize={
        GPU_RETAINED_DOM_CONTROL_SNAPSHOT_PROGRESSIVE_BATCH_SIZE
      }
      renderSource={(source) => (
        <MemoizedGpuRetainedDomControlSnapshotSource
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
        hostPresentation: "snapshot-source",
        onActivate: undefined,
        presentation: "dom-control-plane",
      })}
    </div>
  );
}

const MemoizedGpuRetainedDomControlSnapshotSource = memo(
  GpuRetainedDomControlSnapshotSource,
  areGpuRetainedDomControlSnapshotSourcePropsEqual,
);

function areGpuRetainedDomControlSnapshotSourcePropsEqual(
  previous: {
    readonly onSnapshotDraw?: ((surfaceId: string) => void) | undefined;
    readonly renderControl: GpuFlowDomControlRenderer;
    readonly source: GpuRetainedDomControlSourceDescriptor;
  },
  next: {
    readonly onSnapshotDraw?: ((surfaceId: string) => void) | undefined;
    readonly renderControl: GpuFlowDomControlRenderer;
    readonly source: GpuRetainedDomControlSourceDescriptor;
  },
): boolean {
  return (
    previous.onSnapshotDraw === next.onSnapshotDraw &&
    previous.renderControl === next.renderControl &&
    previous.source.active === next.source.active &&
    previous.source.sourceId === next.source.sourceId &&
    previous.source.sourceKey === next.source.sourceKey &&
    previous.source.snapshotCacheKeyRevision ===
      next.source.snapshotCacheKeyRevision &&
    gpuRetainedDomControlActivationEqual(
      previous.source.activation,
      next.source.activation,
    )
  );
}

function gpuRetainedDomControlActivationEqual(
  previous: GpuRetainedDomControlSourceDescriptor["activation"],
  next: GpuRetainedDomControlSourceDescriptor["activation"],
): boolean {
  return (
    previous?.kind === next?.kind &&
    previous?.clientPoint.x === next?.clientPoint.x &&
    previous?.clientPoint.y === next?.clientPoint.y
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
