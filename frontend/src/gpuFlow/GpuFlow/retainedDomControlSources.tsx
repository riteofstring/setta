import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";

import {
  isChromeReproActive,
  isChromeReproVerboseGpuFlowActive,
  nowChromeReproPerformanceMs,
  postMeasuredChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
} from "../GpuRetainedContentSurfaces";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  HTML_SURFACE_PASSIVE_TRANSFORM,
  HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE,
} from "../htmlSurfaces/interactionProjector";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "../htmlSurfaces/sourceLayer";
import { createGpuRetainedContentRowControlRect } from "../retainedContentRowLayout";
import { createGpuRetainedRowContentSceneWithScrollWindow } from "../retainedContentScene";
import {
  getGpuRetainedContentSceneSourceInput,
  type GpuRetainedContentSceneSourceInput,
} from "../retainedContentSceneSourceMetadata";
import type { GpuRetainedContentRow } from "../retainedContentSceneTypes";
import {
  GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
  type GpuRetainedDomControlSourceDescriptor,
} from "../retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowScene } from "../scene";
import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuRect,
  type GpuViewportInput,
} from "../viewportMath";

export type GpuRetainedDomControlRenderer = (
  source: GpuRetainedDomControlSourceDescriptor,
) => ReactNode;

const GPU_RETAINED_DOM_CONTROL_SOURCE_CLASS_NAME =
  "setta-gpu-flow__retained-dom-control-source";

const EMPTY_RETAINED_DOM_CONTROL_SOURCES: readonly GpuRetainedDomControlSourceDescriptor[] =
  [];

type GpuRetainedTextLikeDomControlRow = GpuRetainedContentRow & {
  readonly control: Extract<
    NonNullable<GpuRetainedContentRow["control"]>,
    { readonly kind: "text-like" }
  >;
};

export function useGpuFlowRetainedDomControlSources({
  elementBySourceIdRef,
  renderSource,
  retainedRuntimeFrame,
  surfaceRef,
}: {
  readonly elementBySourceIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly renderSource: GpuRetainedDomControlRenderer | undefined;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): {
  readonly retainedDomControlSourceElement: ReactNode;
} {
  const sources = useMemo(
    () =>
      renderSource
        ? retainedRuntimeFrame?.descriptors.domControlSources ??
          EMPTY_RETAINED_DOM_CONTROL_SOURCES
        : EMPTY_RETAINED_DOM_CONTROL_SOURCES,
    [renderSource, retainedRuntimeFrame],
  );
  const paintSourceSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!renderSource || sources.length === 0) {
      paintSourceSignatureRef.current = null;
      return;
    }
    const signature = createGpuRetainedDomControlPaintSignature(sources);
    if (signature === paintSourceSignatureRef.current) {
      return;
    }
    paintSourceSignatureRef.current = signature;
    surfaceRef.current?.requestPaint();
    surfaceRef.current?.requestFrame("manual");
  }, [renderSource, sources, surfaceRef]);
  const chromeReproSourceSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isChromeReproActive()) {
      return;
    }
    const buildStartedAtMs = nowChromeReproPerformanceMs();
    const verbose = isChromeReproVerboseGpuFlowActive();
    const state = sources.map((source) =>
      summarizeGpuRetainedDomControlSource(source, { verbose }),
    );
    const signature = JSON.stringify(state);
    if (signature === chromeReproSourceSignatureRef.current) {
      return;
    }
    chromeReproSourceSignatureRef.current = signature;
    postMeasuredChromeReproEvent(
      "gpu-flow-retained-dom-control-sources",
      {
        sourceCount: sources.length,
        sources: state,
      },
      {
        buildDurationMs: nowChromeReproPerformanceMs() - buildStartedAtMs,
      },
    );
  }, [sources]);
  const handleSourceElementChange = useCallback(
    (sourceId: string, element: HTMLElement | null) => {
      if (!element) {
        elementBySourceIdRef.current.delete(sourceId);
        return;
      }
      elementBySourceIdRef.current.set(sourceId, element);
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [elementBySourceIdRef, surfaceRef],
  );
  const handleSourceReady = useCallback(
    (sourceId: string) => {
      if (!elementBySourceIdRef.current.has(sourceId)) {
        return;
      }
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [elementBySourceIdRef, surfaceRef],
  );

  return {
    retainedDomControlSourceElement:
      renderSource && sources.length > 0 ? (
        <GpuRetainedDomControlSourceLayer
          onSourceElementChange={handleSourceElementChange}
          onSourceReady={handleSourceReady}
          renderSource={renderSource}
          sources={sources}
        />
      ) : null,
  };
}

export function getGpuRetainedDomControlSources(
  scene: GpuFlowScene | undefined,
): readonly GpuRetainedDomControlSourceDescriptor[] {
  assertGpuRetainedDomControlSceneOnlyAccessAllowed();
  return getGpuRetainedDomControlSourcesFromSourceSurfaces(
    getGpuRetainedContentSourceSurfaces(scene?.contentSurfaces),
  );
}

function assertGpuRetainedDomControlSceneOnlyAccessAllowed() {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return;
  }
  throw new Error(
    "Retained DOM-control sources must be read from a sampled retained runtime frame.",
  );
}

export function getGpuRetainedDomControlSourcesFromSourceSurfaces(
  surfaces: readonly GpuRetainedContentSourceSurface[],
  options: {
    readonly viewport?: GpuViewportInput | undefined;
  } = {},
): readonly GpuRetainedDomControlSourceDescriptor[] {
  return surfaces.flatMap((surface) =>
    getGpuRetainedDomControlSourcesForSurface(surface, options),
  );
}

function getGpuRetainedDomControlSourcesForSurface(
  surface: GpuRetainedContentSourceSurface,
  options: {
    readonly viewport?: GpuViewportInput | undefined;
  },
): readonly GpuRetainedDomControlSourceDescriptor[] {
  const rasterScene = createGpuRetainedRowContentSceneWithScrollWindow({
    scene: surface.retainedScene,
    scrollOffset: surface.textureWindow.cacheScrollOffset,
    viewportRect: surface.textureWindow.cacheViewportRect,
  });
  const sourceInput = getGpuRetainedContentSceneSourceInput(rasterScene);
  const liveSourceInput = getGpuRetainedContentSceneSourceInput(
    surface.retainedScene,
  );
  if (!sourceInput || !liveSourceInput) {
    return [];
  }
  const textureBounds = {
    height: surface.textureWindow.textureHeight,
    width: surface.textureWindow.textureWidth,
    x: 0,
    y: 0,
  };
  const liveRowsById = new Map(
    surface.retainedScene.rows.map((row) => [row.id, row]),
  );
  const sources: GpuRetainedDomControlSourceDescriptor[] = [];
  for (const row of rasterScene.rows) {
    const source = createGpuRetainedDomControlSourceForRow({
      liveRowsById,
      liveSourceInput,
      options,
      row,
      sourceInput,
      surface,
      textureBounds,
    });
    if (source) {
      sources.push(source);
    }
  }
  return sources;
}

function createGpuRetainedDomControlSourceForRow({
  liveRowsById,
  liveSourceInput,
  options,
  row,
  sourceInput,
  surface,
  textureBounds,
}: {
  readonly liveRowsById: ReadonlyMap<string, GpuRetainedContentRow>;
  readonly liveSourceInput: GpuRetainedContentSceneSourceInput;
  readonly options: {
    readonly viewport?: GpuViewportInput | undefined;
  };
  readonly row: GpuRetainedContentRow;
  readonly sourceInput: GpuRetainedContentSceneSourceInput;
  readonly surface: GpuRetainedContentSourceSurface;
  readonly textureBounds: GpuRect;
}): GpuRetainedDomControlSourceDescriptor | null {
  if (!isGpuRetainedTextLikeDomControlRow(row)) {
    return null;
  }
  const controlRectSurfaceCssPx = createGpuRetainedContentRowControlRect({
    controlWidth: sourceInput.controlWidth,
    indentWidth: sourceInput.indentWidth,
    rightInset: sourceInput.controlRightInset,
    rowDepth: row.depth,
    rowRect: row.projectedRect,
  });
  const clipRectSurfaceCssPx = intersectGpuRetainedDomControlRects(
    controlRectSurfaceCssPx,
    textureBounds,
  );
  if (clipRectSurfaceCssPx.width <= 0 || clipRectSurfaceCssPx.height <= 0) {
    return null;
  }
  const liveRow = liveRowsById.get(row.id) ?? row;
  const liveControlRectSurfaceCssPx = getGpuRetainedDomControlLiveRect({
    fallbackRect: controlRectSurfaceCssPx,
    liveRow,
    liveSourceInput,
  });
  const active = Boolean(liveRow.state.nativeControlActive);
  const source = createGpuRetainedDomControlSourceBase({
    active,
    clipRectSurfaceCssPx,
    controlRectSurfaceCssPx,
    liveControlRectSurfaceCssPx,
    liveRow,
    options,
    row,
    surface,
  });
  return {
    ...source,
    sourceKey: createGpuRetainedDomControlSourceKey(source),
  };
}

function isGpuRetainedTextLikeDomControlRow(
  row: GpuRetainedContentRow,
): row is GpuRetainedTextLikeDomControlRow {
  return (
    row.control?.kind === "text-like" && row.control.renderOwner === "dom-owned"
  );
}

function getGpuRetainedDomControlLiveRect({
  fallbackRect,
  liveRow,
  liveSourceInput,
}: {
  readonly fallbackRect: GpuRect;
  readonly liveRow: GpuRetainedContentRow;
  readonly liveSourceInput: GpuRetainedContentSceneSourceInput;
}): GpuRect {
  if (liveRow.control?.kind !== "text-like") {
    return fallbackRect;
  }
  return createGpuRetainedContentRowControlRect({
    controlWidth: liveSourceInput.controlWidth,
    indentWidth: liveSourceInput.indentWidth,
    rightInset: liveSourceInput.controlRightInset,
    rowDepth: liveRow.depth,
    rowRect: liveRow.projectedRect,
  });
}

function createGpuRetainedDomControlSourceBase({
  active,
  clipRectSurfaceCssPx,
  controlRectSurfaceCssPx,
  liveControlRectSurfaceCssPx,
  liveRow,
  options,
  row,
  surface,
}: {
  readonly active: boolean;
  readonly clipRectSurfaceCssPx: GpuRect;
  readonly controlRectSurfaceCssPx: GpuRect;
  readonly liveControlRectSurfaceCssPx: GpuRect;
  readonly liveRow: GpuRetainedContentRow;
  readonly options: {
    readonly viewport?: GpuViewportInput | undefined;
  };
  readonly row: GpuRetainedTextLikeDomControlRow;
  readonly surface: GpuRetainedContentSourceSurface;
}): Omit<GpuRetainedDomControlSourceDescriptor, "sourceKey"> {
  const sourceRectCssPx = {
    height: controlRectSurfaceCssPx.height,
    width: controlRectSurfaceCssPx.width,
    x: 0,
    y: 0,
  };
  const textureRectCssPx = toRetainedContentRectCss({
    rect: controlRectSurfaceCssPx,
    viewportRect: surface.textureWindow.cacheViewportRect,
    windowOrigin: surface.textureWindow.cacheScrollOffset,
  });
  const worldRectFlowPx = {
    height: liveControlRectSurfaceCssPx.height,
    width: liveControlRectSurfaceCssPx.width,
    x: surface.rect.x + liveControlRectSurfaceCssPx.x,
    y: surface.rect.y + liveControlRectSurfaceCssPx.y,
  };
  const viewportRectCssPx = toViewportRectCssPx({
    rect: worldRectFlowPx,
    viewport: options.viewport,
  });
  return {
    active,
    ...(active && liveRow.state.domControlActivation
      ? { activation: liveRow.state.domControlActivation }
      : {}),
    clipRectSurfaceCssPx,
    controlRectSurfaceCssPx,
    defaultValue: row.control.defaultDisplayValue,
    disabled: row.state.disabled,
    editorKind: row.control.editorKind,
    error: row.state.error,
    interactionPolicy: GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
    language: row.control.policy.language,
    layerSlot: active ? "active-projected-source" : "passive-dom-control",
    lifecycleState: active ? "active-projected" : "passive-texture-pending",
    linePolicy: row.control.policy.linePolicy,
    maxVisibleLines: row.control.policy.maxVisibleLines,
    minVisibleLines: row.control.policy.minVisibleLines,
    rendererFamily: row.control.rendererFamily,
    role: "text-like",
    rowId: row.id,
    sectionId: surface.ownerSectionId,
    sourceId: getGpuRetainedDomControlSourceId({
      rowId: row.id,
      surfaceId: surface.id,
    }),
    sourceRectCssPx,
    surfaceId: surface.id,
    textureRectCssPx,
    textureRectDevicePx: toDeviceRectApproximation(textureRectCssPx),
    value: row.control.displayValue,
    valueStyleKey: createGpuRetainedDomControlValueStyleKey({
      control: row.control,
      controlRectSurfaceCssPx,
      disabled: row.state.disabled,
      error: row.state.error,
    }),
    viewportRectCssPx,
    worldRectFlowPx,
    wrapLines: row.control.policy.wrapLines,
    zOrder: surface.zIndex + 1,
  };
}

function GpuRetainedDomControlSourceLayer({
  onSourceElementChange,
  onSourceReady,
  renderSource,
  sources,
}: {
  readonly onSourceElementChange:
    | ((sourceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly onSourceReady: ((sourceId: string) => void) | undefined;
  readonly renderSource: GpuRetainedDomControlRenderer;
  readonly sources: readonly GpuRetainedDomControlSourceDescriptor[];
}) {
  const configureSourceElement = useCallback(
    (
      config: HtmlSurfaceSourceElementConfig<GpuRetainedDomControlSourceDescriptor>,
    ) =>
      configureGpuRetainedDomControlSourceElement({
        ...config,
        onSourceReady,
      }),
    [onSourceReady],
  );
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureSourceElement}
      getSourceId={getGpuRetainedDomControlSourceIdFromSource}
      onSourceElementChange={onSourceElementChange}
      renderSource={renderSource}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_RETAINED_DOM_CONTROL_SOURCE_CLASS_NAME}`}
      sources={sources}
    />
  );
}

function configureGpuRetainedDomControlSourceElement({
  anchor,
  host,
  onSourceReady,
  source,
  sourceId,
}: HtmlSurfaceSourceElementConfig<GpuRetainedDomControlSourceDescriptor> & {
  readonly onSourceReady: ((sourceId: string) => void) | undefined;
}) {
  host.dataset.gpuFlowRetainedDomControlSource = "true";
  host.dataset.gpuFlowRetainedDomControlSourceKey = source.sourceKey;
  host.dataset.gpuFlowRetainedDomControlLifecycle = source.lifecycleState;
  host.dataset.gpuFlowRetainedDomControlLayer = source.layerSlot;
  host.dataset.gpuFlowRetainedSurfaceId = source.surfaceId;
  host.dataset.gpuFlowRetainedRowId = source.rowId;
  host.style.height = `${source.sourceRectCssPx.height}px`;
  host.style.overflow = "hidden";
  host.style.width = `${source.sourceRectCssPx.width}px`;
  if (source.active) {
    moveGpuRetainedDomControlSourceToActiveOverlay({ anchor, host });
    configureActiveGpuRetainedDomControlSourceElement(host, source);
  } else {
    moveGpuRetainedDomControlSourceToPassiveLayoutSubtree({ anchor, host });
    configurePassiveGpuRetainedDomControlSourceElement(host);
  }
  deferGpuRetainedDomControlReadyKey({
    host,
    onSourceReady,
    sourceId,
    sourceKey: source.sourceKey,
  });
}

function configureActiveGpuRetainedDomControlSourceElement(
  host: HTMLElement,
  source: GpuRetainedDomControlSourceDescriptor,
) {
  const scale = resolveGpuRetainedDomControlViewportScale(source);
  setInert(host, false);
  host.removeAttribute("aria-hidden");
  host.setAttribute(HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE, "true");
  host.style.contain = "layout paint style";
  host.style.display = "";
  host.style.left = `${source.viewportRectCssPx.x}px`;
  host.style.pointerEvents = "auto";
  host.style.top = `${source.viewportRectCssPx.y}px`;
  host.style.transform = `scale(${scale})`;
  host.style.transformOrigin = "top left";
  host.style.zIndex = String(source.zOrder);
}

function configurePassiveGpuRetainedDomControlSourceElement(host: HTMLElement) {
  setInert(host, true);
  host.setAttribute("aria-hidden", "true");
  host.removeAttribute(HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE);
  host.style.display = "";
  host.style.left = "0px";
  host.style.pointerEvents = "none";
  host.style.top = "0px";
  host.style.transform = HTML_SURFACE_PASSIVE_TRANSFORM;
  host.style.transformOrigin = "0 0";
  host.style.zIndex = "";
}

function moveGpuRetainedDomControlSourceToActiveOverlay({
  anchor,
  host,
}: {
  readonly anchor: HTMLElement;
  readonly host: HTMLElement;
}) {
  const activeParent =
    anchor.closest<HTMLElement>(".setta-gpu-flow") ?? anchor.ownerDocument.body;
  if (host.parentNode !== activeParent) {
    activeParent.appendChild(host);
  }
}

function moveGpuRetainedDomControlSourceToPassiveLayoutSubtree({
  anchor,
  host,
}: {
  readonly anchor: HTMLElement;
  readonly host: HTMLElement;
}) {
  const parent = anchor.parentNode;
  if (!parent) {
    return;
  }
  if (host.parentNode !== parent || host.previousSibling !== anchor) {
    parent.insertBefore(host, anchor.nextSibling);
  }
}

function setInert(host: HTMLElement, inert: boolean) {
  (host as HTMLElement & { inert?: boolean }).inert = inert;
}

function resolveGpuRetainedDomControlViewportScale(
  source: GpuRetainedDomControlSourceDescriptor,
): number {
  if (source.sourceRectCssPx.width <= 0) {
    return 1;
  }
  return source.viewportRectCssPx.width / source.sourceRectCssPx.width;
}

function getGpuRetainedDomControlSourceIdFromSource(
  source: GpuRetainedDomControlSourceDescriptor,
): string {
  return source.sourceId;
}

function getGpuRetainedDomControlSourceId({
  rowId,
  surfaceId,
}: {
  readonly rowId: string;
  readonly surfaceId: string;
}): string {
  return `retained-dom-control:${surfaceId}:${rowId}`;
}

function deferGpuRetainedDomControlReadyKey({
  host,
  onSourceReady,
  sourceId,
  sourceKey,
}: {
  readonly host: HTMLElement;
  readonly onSourceReady: ((sourceId: string) => void) | undefined;
  readonly sourceId: string;
  readonly sourceKey: string;
}) {
  if (
    host.dataset.gpuFlowRetainedDomControlReadyKey === sourceKey ||
    host.dataset.gpuFlowRetainedDomControlPendingReadyKey === sourceKey
  ) {
    return;
  }
  host.dataset.gpuFlowRetainedDomControlReadyKey = "";
  host.dataset.gpuFlowRetainedDomControlPendingReadyKey = sourceKey;
  const view = host.ownerDocument.defaultView;
  if (!view?.requestAnimationFrame) {
    host.dataset.gpuFlowRetainedDomControlReadyKey = sourceKey;
    delete host.dataset.gpuFlowRetainedDomControlPendingReadyKey;
    onSourceReady?.(sourceId);
    return;
  }
  view.requestAnimationFrame(() => {
    view.requestAnimationFrame(() => {
      if (host.dataset.gpuFlowRetainedDomControlSourceKey !== sourceKey) {
        return;
      }
      host.dataset.gpuFlowRetainedDomControlReadyKey = sourceKey;
      delete host.dataset.gpuFlowRetainedDomControlPendingReadyKey;
      onSourceReady?.(sourceId);
    });
  });
}

function createGpuRetainedDomControlPaintSignature(
  sources: readonly GpuRetainedDomControlSourceDescriptor[],
): string {
  return JSON.stringify(
    sources.map((source) => ({
      active: source.active,
      sourceId: source.sourceId,
      sourceKey: source.sourceKey,
      viewportRectCssPx: source.active ? source.viewportRectCssPx : null,
    })),
  );
}

function createGpuRetainedDomControlSourceKey(
  source: Omit<GpuRetainedDomControlSourceDescriptor, "sourceKey">,
): string {
  return JSON.stringify({
    defaultValue: source.defaultValue,
    disabled: source.disabled,
    error: source.error,
    language: source.language,
    linePolicy: source.linePolicy,
    rowId: source.rowId,
    sourceHeight: source.sourceRectCssPx.height,
    sourceWidth: source.sourceRectCssPx.width,
    surfaceId: source.surfaceId,
    value: source.value,
    valueStyleKey: source.valueStyleKey,
    wrapLines: source.wrapLines,
  });
}

function createGpuRetainedDomControlValueStyleKey({
  control,
  controlRectSurfaceCssPx,
  disabled,
  error,
}: {
  readonly control: Extract<
    NonNullable<
      GpuRetainedContentSourceSurface["retainedScene"]["rows"][number]["control"]
    >,
    { readonly kind: "text-like" }
  >;
  readonly controlRectSurfaceCssPx: GpuRect;
  readonly disabled: boolean;
  readonly error: boolean;
}): string {
  return JSON.stringify({
    disabled,
    editorKind: control.editorKind,
    error,
    height: controlRectSurfaceCssPx.height,
    language: control.policy.language,
    linePolicy: control.policy.linePolicy,
    rendererFamily: control.rendererFamily,
    width: controlRectSurfaceCssPx.width,
    wrapLines: control.policy.wrapLines,
  });
}

function summarizeGpuRetainedDomControlSource(
  source: GpuRetainedDomControlSourceDescriptor,
  { verbose }: { readonly verbose: boolean },
) {
  return {
    active: source.active,
    ...(verbose ? { value: source.value } : {}),
    defaultValueLength: source.defaultValue.length,
    disabled: source.disabled,
    editorKind: source.editorKind,
    error: source.error,
    layerSlot: source.layerSlot,
    lifecycleState: source.lifecycleState,
    linePolicy: source.linePolicy,
    role: source.role,
    rowId: source.rowId,
    sectionId: source.sectionId,
    sourceId: source.sourceId,
    sourceKeyLength: source.sourceKey.length,
    sourceRectCssPx: roundGpuRetainedDomControlRect(source.sourceRectCssPx),
    surfaceId: source.surfaceId,
    valueLength: source.value.length,
    viewportRectCssPx: roundGpuRetainedDomControlRect(source.viewportRectCssPx),
    wrapLines: source.wrapLines,
  };
}

function roundGpuRetainedDomControlRect(rect: GpuRect): GpuRect {
  return {
    height: roundChromeReproMs(rect.height),
    width: roundChromeReproMs(rect.width),
    x: roundChromeReproMs(rect.x),
    y: roundChromeReproMs(rect.y),
  };
}

function toRetainedContentRectCss({
  rect,
  viewportRect,
  windowOrigin,
}: {
  readonly rect: GpuRect;
  readonly viewportRect: GpuRect;
  readonly windowOrigin: { readonly x: number; readonly y: number };
}): GpuRect {
  return {
    height: rect.height,
    width: rect.width,
    x: rect.x - viewportRect.x + windowOrigin.x,
    y: rect.y - viewportRect.y + windowOrigin.y,
  };
}

function toViewportRectCssPx({
  rect,
  viewport,
}: {
  readonly rect: GpuRect;
  readonly viewport: GpuViewportInput | undefined;
}): GpuRect {
  const normalizedViewport = normalizeGpuViewport(viewport ?? [0, 0, 1]);
  const position = flowToScreenPosition(rect, normalizedViewport);
  return {
    height: rect.height * normalizedViewport.zoom,
    width: rect.width * normalizedViewport.zoom,
    x: position.x,
    y: position.y,
  };
}

function toDeviceRectApproximation(rect: GpuRect): GpuRect {
  const devicePixelRatio =
    typeof window === "undefined" ? 1 : window.devicePixelRatio;
  return {
    height: Math.max(1, Math.ceil(rect.height * devicePixelRatio)),
    width: Math.max(1, Math.ceil(rect.width * devicePixelRatio)),
    x: Math.floor(rect.x * devicePixelRatio),
    y: Math.floor(rect.y * devicePixelRatio),
  };
}

function intersectGpuRetainedDomControlRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(0, maxY - y),
    width: Math.max(0, maxX - x),
    x,
    y,
  };
}
