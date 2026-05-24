import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode,
} from "react";

import type { GpuSurfaceHandle } from "../GpuSurface";
import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type { NodeTexturePriority } from "../dirtyTracking";
import {
  clearGpuNodeDomTransformSyncCacheNode,
  type GpuHtmlSurfaceOverlayLayout,
  type GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import {
  HTML_SURFACE_CAPTURE_ONLY_SOURCE_ATTRIBUTE,
  HTML_SURFACE_EXPLICIT_DIRTY_SOURCE_ATTRIBUTE,
} from "../htmlSurfaces/sourceDom";
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
const GPU_RETAINED_DOM_CONTROL_SNAPSHOT_PROGRESSIVE_BATCH_SIZE = 4;
const GPU_RETAINED_DOM_CONTROL_SNAPSHOT_PROGRESSIVE_BATCH_DELAY_MS = 120;
const noop = () => {};
type GpuRetainedDomControlSnapshotSourceDiagnostic = {
  readonly dirtySurface: unknown;
  readonly expectedTextureContentKey: string;
  readonly inPreparation: boolean;
  readonly lifecycle: unknown;
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
  const [
    browserVisualPreparationSnapshot,
    setBrowserVisualPreparationSnapshot,
  ] = useState(() => browserVisualRuntime?.getPreparationSnapshot() ?? null);
  useLayoutEffect(() => {
    if (!browserVisualRuntime) {
      setBrowserVisualPreparationSnapshot(null);
      return;
    }
    browserVisualRuntime.setDomControlSnapshotPreparationRenderer(
      setBrowserVisualPreparationSnapshot,
    );
    return () => {
      browserVisualRuntime.setDomControlSnapshotPreparationRenderer(null);
    };
  }, [browserVisualRuntime]);
  const retainedRuntimeFrameSnapshotSources = useMemo(
    () =>
      getGpuRetainedDomControlSnapshotSources(
        retainedRuntimeFrame?.descriptors.domControlSources,
      ),
    [retainedRuntimeFrame],
  );
  const snapshotSources = useMemo(() => {
    if (browserVisualRuntime) {
      return combineGpuFlowRetainedDomControlSnapshotSources([
        ...(browserVisualSnapshot?.domControls.snapshotControls ?? []),
        ...(browserVisualPreparationSnapshot?.domControls.snapshotControls ??
          []),
      ]);
    }
    return retainedRuntimeFrameSnapshotSources;
  }, [
    browserVisualRuntime,
    browserVisualPreparationSnapshot,
    browserVisualSnapshot,
    retainedRuntimeFrameSnapshotSources,
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
      snapshotSources.map((source) =>
        createGpuRetainedDomControlSnapshotSourceDiagnostic({
          preparationSnapshotSourceIds,
          source,
          textureManager: textureManagerRef.current,
        }),
      );
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
      element.setAttribute(HTML_SURFACE_CAPTURE_ONLY_SOURCE_ATTRIBUTE, "true");
      element.setAttribute(
        HTML_SURFACE_EXPLICIT_DIRTY_SOURCE_ATTRIBUTE,
        "true",
      );
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
      requestGpuFlowRetainedDomControlSnapshotSourceFrame({
        preparationSnapshotSourceIds,
        surface: surfaceRef.current,
        surfaceId,
      });
    },
    [
      browserVisualTextureManager,
      committedSurfaceRuntime,
      nodeDomTransformSyncCacheRef,
      nodeElementByIdRef,
      preparationSnapshotSourceIds,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
    ],
  );
  const handleSnapshotDraw = useCallback(
    (surfaceId: string, source: GpuRetainedDomControlSourceDescriptor) => {
      handleGpuRetainedDomControlSnapshotSourceDraw({
        browserVisualTextureManager,
        committedSurfaceRuntime,
        element: nodeElementByIdRef.current.get(surfaceId),
        preparationSnapshotSourceIds,
        source,
        surface: surfaceRef.current,
        surfaceId,
        textureManager: textureManagerRef.current,
      });
    },
    [
      browserVisualTextureManager,
      committedSurfaceRuntime,
      nodeElementByIdRef,
      preparationSnapshotSourceIds,
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

function createGpuRetainedDomControlSnapshotSourceDiagnostic({
  preparationSnapshotSourceIds,
  source,
  textureManager,
}: {
  readonly preparationSnapshotSourceIds: ReadonlySet<string> | undefined;
  readonly source: GpuRetainedDomControlSourceDescriptor;
  readonly textureManager: HtmlSurfaceTextureManager | null;
}): GpuRetainedDomControlSnapshotSourceDiagnostic {
  const surfaceId = getGpuRetainedDomControlSnapshotSourceId(source);
  const managerDiagnostic =
    createGpuRetainedDomControlSnapshotSourceManagerDiagnostic({
      source,
      surfaceId,
      textureManager,
    });
  return {
    ...managerDiagnostic,
    expectedTextureContentKey: source.snapshotCacheKeyRevision,
    inPreparation: preparationSnapshotSourceIds?.has(surfaceId) === true,
    sourceId: source.sourceId,
    surfaceId,
  };
}

function createGpuRetainedDomControlSnapshotSourceManagerDiagnostic({
  source,
  surfaceId,
  textureManager,
}: {
  readonly source: GpuRetainedDomControlSourceDescriptor;
  readonly surfaceId: string;
  readonly textureManager: HtmlSurfaceTextureManager | null;
}) {
  if (!textureManager) {
    return { dirtySurface: null, lifecycle: null, texture: null };
  }
  const texture = textureManager.getCommittedSurfaceTexture(surfaceId) ?? null;
  return {
    dirtySurface:
      textureManager
        .getDirtySurfaces()
        .find((surface) => surface.surfaceId === surfaceId) ?? null,
    lifecycle:
      textureManager.getSurfaceTextureLifecycleDiagnostics([surfaceId])?.[0] ??
      null,
    texture: texture
      ? createGpuRetainedDomControlSnapshotTextureDiagnostic({
          source,
          texture,
        })
      : null,
  };
}

function createGpuRetainedDomControlSnapshotTextureDiagnostic({
  source,
  texture,
}: {
  readonly source: GpuRetainedDomControlSourceDescriptor;
  readonly texture: NonNullable<
    ReturnType<HtmlSurfaceTextureManager["getCommittedSurfaceTexture"]>
  >;
}) {
  return {
    dirtyContent: texture.dirtyContent,
    dirtyResolution: texture.dirtyResolution,
    lastUploadFrame: texture.lastUploadFrame,
    textureContentKey: texture.textureContentKey,
    textureContentKeyMatches:
      texture.textureContentKey === source.snapshotCacheKeyRevision,
  };
}

function handleGpuRetainedDomControlSnapshotSourceDraw({
  browserVisualTextureManager,
  committedSurfaceRuntime,
  element,
  preparationSnapshotSourceIds,
  source,
  surface,
  surfaceId,
  textureManager,
}: {
  readonly browserVisualTextureManager: HtmlSurfaceTextureManager | null;
  readonly committedSurfaceRuntime: GpuFlowCommittedSurfaceRuntime | undefined;
  readonly element: HTMLElement | undefined;
  readonly preparationSnapshotSourceIds: ReadonlySet<string> | undefined;
  readonly source: GpuRetainedDomControlSourceDescriptor;
  readonly surface: GpuSurfaceHandle | null;
  readonly surfaceId: string;
  readonly textureManager: HtmlSurfaceTextureManager | null;
}): void {
  const deferUploadUntilPaint = true;
  const priority: NodeTexturePriority =
    preparationSnapshotSourceIds?.has(surfaceId) === true
      ? "interactive"
      : "visible";
  const shouldMarkDirty =
    !textureManager ||
    shouldMarkGpuFlowRetainedDomControlSnapshotSourceDirty({
      source,
      surfaceId,
      textureManager,
    });
  registerGpuFlowRetainedDomControlSnapshotDrawTexture({
    deferUploadUntilPaint,
    element,
    priority,
    source,
    surfaceId,
    textureManager,
  });
  markGpuFlowRetainedDomControlSnapshotDrawTextureDirty({
    deferUploadUntilPaint,
    priority,
    shouldMarkDirty,
    surfaceId,
    textureManager,
  });
  registerGpuFlowRetainedDomControlSnapshotTextureManager({
    committedSurfaceRuntime,
    textureManager: browserVisualTextureManager,
  });
  requestGpuFlowRetainedDomControlSnapshotDrawFollowUp({
    preparationSnapshotSourceIds,
    shouldMarkDirty,
    surface,
    surfaceId,
  });
}

function registerGpuFlowRetainedDomControlSnapshotDrawTexture({
  deferUploadUntilPaint,
  element,
  priority,
  source,
  surfaceId,
  textureManager,
}: {
  readonly deferUploadUntilPaint: boolean;
  readonly element: HTMLElement | undefined;
  readonly priority: NodeTexturePriority;
  readonly source: GpuRetainedDomControlSourceDescriptor;
  readonly surfaceId: string;
  readonly textureManager: HtmlSurfaceTextureManager | null;
}): void {
  if (!textureManager || !element) {
    return;
  }
  registerGpuFlowRetainedDomControlSnapshotSourceTexture({
    deferUploadUntilPaint,
    element,
    priority,
    source,
    surfaceId,
    textureManager,
  });
}

function markGpuFlowRetainedDomControlSnapshotDrawTextureDirty({
  deferUploadUntilPaint,
  priority,
  shouldMarkDirty,
  surfaceId,
  textureManager,
}: {
  readonly deferUploadUntilPaint: boolean;
  readonly priority: NodeTexturePriority;
  readonly shouldMarkDirty: boolean;
  readonly surfaceId: string;
  readonly textureManager: HtmlSurfaceTextureManager | null;
}): void {
  if (!shouldMarkDirty) {
    return;
  }
  textureManager?.markSurfaceTextureDirty({
    content: true,
    deferUploadUntilPaint,
    priority,
    reason: "content",
    requestPaint: false,
    surfaceId,
  });
}

function requestGpuFlowRetainedDomControlSnapshotDrawFollowUp({
  preparationSnapshotSourceIds,
  shouldMarkDirty,
  surface,
  surfaceId,
}: {
  readonly preparationSnapshotSourceIds: ReadonlySet<string> | undefined;
  readonly shouldMarkDirty: boolean;
  readonly surface: GpuSurfaceHandle | null;
  readonly surfaceId: string;
}): void {
  if (!shouldMarkDirty) {
    return;
  }
  surface?.requestPaint();
  requestGpuFlowRetainedDomControlSnapshotSourceFrame({
    preparationSnapshotSourceIds,
    surface,
    surfaceId,
  });
}

export function shouldMarkGpuFlowRetainedDomControlSnapshotSourceDirty({
  source,
  surfaceId,
  textureManager,
}: {
  readonly source: Pick<
    GpuRetainedDomControlSourceDescriptor,
    "snapshotCacheKeyRevision"
  >;
  readonly surfaceId: string;
  readonly textureManager: Pick<
    HtmlSurfaceTextureManager,
    "getCommittedSurfaceTexture"
  >;
}): boolean {
  const texture = textureManager.getCommittedSurfaceTexture(surfaceId);
  return (
    !texture ||
    texture.lastUploadFrame < 0 ||
    texture.textureContentKey !== source.snapshotCacheKeyRevision
  );
}

export function requestGpuFlowRetainedDomControlSnapshotSourceFrame({
  preparationSnapshotSourceIds,
  scheduleFollowUpFrame = scheduleGpuFlowRetainedDomControlSnapshotSourceFollowUpFrame,
  surface,
  surfaceId,
}: {
  readonly preparationSnapshotSourceIds?: ReadonlySet<string> | undefined;
  readonly scheduleFollowUpFrame?: ((callback: () => void) => void) | undefined;
  readonly surface: Pick<GpuSurfaceHandle, "requestFrame"> | null | undefined;
  readonly surfaceId: string;
}) {
  if (!surface) {
    return;
  }
  if (preparationSnapshotSourceIds?.has(surfaceId) === true) {
    surface.requestFrame("texture-upload");
    scheduleFollowUpFrame(() => {
      surface.requestFrame("manual");
      surface.requestFrame("texture-upload");
    });
    return;
  }
  surface.requestFrame("manual");
  surface.requestFrame("texture-upload");
}

function scheduleGpuFlowRetainedDomControlSnapshotSourceFollowUpFrame(
  callback: () => void,
): void {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => callback());
    });
    return;
  }
  globalThis.setTimeout(callback, 0);
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

export function registerGpuFlowRetainedDomControlSnapshotSourceTexture({
  deferUploadUntilPaint = true,
  element,
  priority,
  source,
  surfaceId,
  textureManager,
}: {
  readonly deferUploadUntilPaint?: boolean | undefined;
  readonly element: Element;
  readonly priority?: NodeTexturePriority | undefined;
  readonly source: GpuRetainedDomControlSourceDescriptor;
  readonly surfaceId: string;
  readonly textureManager: Pick<
    HtmlSurfaceTextureManager,
    "registerSurfaceTexture"
  >;
}): void {
  textureManager.registerSurfaceTexture({
    cssHeight: source.sourceRectCssPx.height,
    cssWidth: source.sourceRectCssPx.width,
    deferUploadUntilPaint,
    devicePixelRatio: source.snapshotCacheKey.devicePixelRatioBucket,
    element,
    ...(priority === undefined ? {} : { priority }),
    surfaceId,
    textureContentKey: source.snapshotCacheKeyRevision,
    zoom: source.snapshotCacheKey.zoomBucket,
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
  preserveUnmatchedSnapshotOverlays = false,
  snapshotSourceIds,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly getRetainedScrollOffset:
    | ((surfaceId: string) => { readonly x: number; readonly y: number } | null)
    | undefined;
  readonly overlays: readonly GpuHtmlSurfaceOverlayLayout[] | undefined;
  readonly preserveUnmatchedSnapshotOverlays?: boolean | undefined;
  readonly snapshotSourceIds?: ReadonlySet<string> | undefined;
}): readonly GpuHtmlSurfaceOverlayLayout[] | undefined {
  const snapshotLayouts = getGpuRetainedDomControlSnapshotSurfaceLayouts(
    controls.filter((control) =>
      isGpuRetainedDomControlSnapshotLayoutControl({
        control,
        snapshotSourceIds,
      }),
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
      return !preserveUnmatchedSnapshotOverlays &&
        isGpuRetainedDomControlSnapshotOverlay(overlay)
        ? []
        : [overlay];
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

function isGpuRetainedDomControlSnapshotLayoutControl({
  control,
  snapshotSourceIds,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly snapshotSourceIds: ReadonlySet<string> | undefined;
}): boolean {
  return (
    (control.visualPolicy === "snapshot" &&
      control.snapshotSurfaceId !== undefined) ||
    snapshotSourceIds?.has(control.sourceId) === true
  );
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
  readonly onSnapshotDraw?:
    | ((
        surfaceId: string,
        source: GpuRetainedDomControlSourceDescriptor,
      ) => void)
    | undefined;
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
  readonly onSnapshotDraw?:
    | ((
        surfaceId: string,
        source: GpuRetainedDomControlSourceDescriptor,
      ) => void)
    | undefined;
  readonly renderControl: GpuFlowDomControlRenderer;
  readonly source: GpuRetainedDomControlSourceDescriptor;
}) {
  const surfaceId = getGpuRetainedDomControlSnapshotSourceId(source);
  useLayoutEffect(() => {
    onSnapshotDraw?.(surfaceId, source);
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
    readonly onSnapshotDraw?:
      | ((
          surfaceId: string,
          source: GpuRetainedDomControlSourceDescriptor,
        ) => void)
      | undefined;
    readonly renderControl: GpuFlowDomControlRenderer;
    readonly source: GpuRetainedDomControlSourceDescriptor;
  },
  next: {
    readonly onSnapshotDraw?:
      | ((
          surfaceId: string,
          source: GpuRetainedDomControlSourceDescriptor,
        ) => void)
      | undefined;
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

export function configureGpuRetainedDomControlSnapshotSourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuRetainedDomControlSourceDescriptor>) {
  host.dataset.gpuFlowDomControlSnapshotSource = "true";
  host.dataset.gpuFlowDomControlId = source.sourceId;
  host.setAttribute(HTML_SURFACE_CAPTURE_ONLY_SOURCE_ATTRIBUTE, "true");
  host.setAttribute(HTML_SURFACE_EXPLICIT_DIRTY_SOURCE_ATTRIBUTE, "true");
  host.setAttribute("aria-hidden", "true");
  host.style.height = `${source.sourceRectCssPx.height}px`;
  host.style.pointerEvents = "none";
  host.style.width = `${source.sourceRectCssPx.width}px`;
  host.style.removeProperty("z-index");
}
