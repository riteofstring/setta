import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { DirtyNodeReason } from "../dirtyTracking";
import type { GpuFlowRuntime } from "../gpuDevice";
import type { GpuCanvasSize, GpuFrameReason } from "../gpuRenderer";
import { GpuSurface, type GpuSurfaceHandle } from "../GpuSurface";
import type { HtmlInCanvasPaintEvent } from "../htmlInCanvasTypes";
import type { GpuViewportInput } from "../viewportMath";
import {
  createHtmlSurfaceAnimationCaptureLeaseController,
  type HtmlSurfaceAnimationCaptureLeaseController,
} from "./animationLease";
import {
  createHtmlSurfaceHitSceneFromVisualScene,
  resolveHtmlSurfaceHitAtClientPoint,
  type HtmlSurfaceHitProjection,
} from "./hitScene";
import {
  createHtmlSurfaceInteractionProjector,
  HTML_SURFACE_PASSIVE_TRANSFORM,
  type HtmlSurfaceInteractionProjector,
} from "./interactionProjector";
import { HtmlSurfaceRenderer } from "./renderer";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "./sourceLayer";
import type { HtmlSurfaceDirtyRect } from "./textureDirtyTiles";
import {
  createHtmlSurfaceTextureManager,
  type HtmlSurfaceTextureManager,
  type HtmlSurfaceTextureRecord,
} from "./textures";
import { DEFAULT_HTML_SURFACE_TEXTURE_UPLOAD_BUDGET_BYTES } from "./textureTiles";
import {
  createHtmlSurfaceVisualScene,
  type FlowRect,
  type HtmlSurfaceMeshVisual,
  type HtmlSurfaceVisualScene,
  type SurfaceVertex,
} from "./visualScene";

export const HTML_SURFACE_WARPED_MESH_FIXTURE_ID =
  "html-surface-warped-mesh-fixture";

export const HTML_SURFACE_WARPED_MESH_FIXTURE_VIEWPORT: GpuViewportInput = [
  72, 56, 1,
];

export const HTML_SURFACE_WARPED_MESH_FIXTURE_RECT: FlowRect = {
  height: 236,
  width: 360,
  x: 64,
  y: 48,
};

type HtmlSurfaceWarpedMeshFixtureSource = {
  readonly height: number;
  readonly surfaceId: string;
  readonly width: number;
};

type HtmlSurfaceWarpedMeshFixtureMetrics = {
  readonly dirtyMarks: number;
  readonly lastHit: HtmlSurfaceHitProjection | null;
  readonly paintEvents: number;
  readonly pointerProjections: number;
  readonly projectedSourceId: string | null;
  readonly renderResult: {
    readonly drawnSurfaceIds: readonly string[];
    readonly vertexCount: number;
  } | null;
  readonly textureUploads: number;
};

type HtmlSurfaceWarpedMeshFixtureProps = {
  readonly className?: string | undefined;
  readonly onMetrics?:
    | ((metrics: HtmlSurfaceWarpedMeshFixtureMetrics) => void)
    | undefined;
  readonly style?: CSSProperties | undefined;
};

type HtmlSurfaceWarpedMeshFixtureSourceState = {
  readonly buttonPressed: boolean;
  readonly focused: boolean;
  readonly hovered: boolean;
  readonly sliderValue: number;
  readonly textValue: string;
  readonly toggleEnabled: boolean;
};

const WARPED_MESH_FIXTURE_SOURCE: HtmlSurfaceWarpedMeshFixtureSource = {
  height: HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.height,
  surfaceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
  width: HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.width,
};

const INITIAL_FIXTURE_SOURCE_STATE: HtmlSurfaceWarpedMeshFixtureSourceState = {
  buttonPressed: false,
  focused: false,
  hovered: false,
  sliderValue: 42,
  textValue: "interactive gpu surface",
  toggleEnabled: false,
};

export function HtmlSurfaceWarpedMeshFixture({
  className = "setta-gpu-flow__warped-mesh-fixture",
  onMetrics,
  style,
}: HtmlSurfaceWarpedMeshFixtureProps) {
  const [sourceState, setSourceState] =
    useState<HtmlSurfaceWarpedMeshFixtureSourceState>(
      INITIAL_FIXTURE_SOURCE_STATE,
    );
  const canvasSizeRef = useRef<GpuCanvasSize | null>(null);
  const dirtyMarksRef = useRef(0);
  const frameRef = useRef(0);
  const lastHitRef = useRef<HtmlSurfaceHitProjection | null>(null);
  const animationCaptureLeaseRef =
    useRef<HtmlSurfaceAnimationCaptureLeaseController | null>(null);
  const paintEventsRef = useRef(0);
  const pointerProjectionsRef = useRef(0);
  const projectorRef = useRef<HtmlSurfaceInteractionProjector>(
    createHtmlSurfaceInteractionProjector(),
  );
  const pointerProjectionCleanupRef = useRef<(() => void) | null>(null);
  const rendererRef = useRef<HtmlSurfaceRenderer | null>(null);
  const runtimeRef = useRef<GpuFlowRuntime | null>(null);
  const sourceElementRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<GpuSurfaceHandle | null>(null);
  const textureManagerRef = useRef<HtmlSurfaceTextureManager | null>(null);
  const transformOnlyPaintRef = useRef(false);
  const textureUploadsRef = useRef(0);
  const renderResultRef = useRef<{
    readonly drawnSurfaceIds: readonly string[];
    readonly vertexCount: number;
  } | null>(null);

  const emitMetrics = useCallback(() => {
    onMetrics?.({
      dirtyMarks: dirtyMarksRef.current,
      lastHit: lastHitRef.current,
      paintEvents: paintEventsRef.current,
      pointerProjections: pointerProjectionsRef.current,
      projectedSourceId: projectorRef.current.getProjectedSourceId(),
      renderResult: renderResultRef.current,
      textureUploads: textureUploadsRef.current,
    });
  }, [onMetrics]);

  const markDirty = useCallback(
    (
      reason: DirtyNodeReason,
      options: {
        readonly scheduleFrame?: boolean | undefined;
        readonly sourceRect?: HtmlSurfaceDirtyRect | undefined;
      } = {},
    ) => {
      dirtyMarksRef.current += 1;
      const frame = nextFixtureFrame(frameRef);
      const queued = textureManagerRef.current?.markSurfaceTextureDirty({
        content: true,
        frame,
        priority: "interactive",
        reason,
        ...(options.sourceRect ? { sourceRect: options.sourceRect } : {}),
        surfaceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
      });
      if (queued && options.scheduleFrame !== false) {
        surfaceRef.current?.requestFrame("texture-upload");
      }
      emitMetrics();
    },
    [emitMetrics],
  );

  const renderSource = useCallback(
    () => (
      <HtmlSurfaceWarpedMeshFixtureSourceView
        onAnimationSettle={(target) => {
          animationCaptureLeaseRef.current?.settle({
            surfaceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
            target,
          });
        }}
        onAnimationStart={(target) => {
          animationCaptureLeaseRef.current?.begin({
            reason: "animation",
            surfaceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
            target,
          });
        }}
        onDirty={markDirty}
        setSourceState={setSourceState}
        state={sourceState}
      />
    ),
    [markDirty, sourceState],
  );

  const configureSourceElement = useCallback(
    ({
      host,
      source,
    }: HtmlSurfaceSourceElementConfig<HtmlSurfaceWarpedMeshFixtureSource>) => {
      host.classList.add("setta-gpu-flow__warped-mesh-source");
      host.dataset.gpuFlowNode = "true";
      host.dataset.id = source.surfaceId;
      host.setAttribute("data-testid", `rf__node-${source.surfaceId}`);
      host.style.height = `${source.height}px`;
      host.style.transform =
        host.style.transform || HTML_SURFACE_PASSIVE_TRANSFORM;
      host.style.width = `${source.width}px`;
    },
    [],
  );

  const handleSourceElementChange = useCallback(
    (sourceId: string, element: HTMLElement | null) => {
      if (sourceId !== HTML_SURFACE_WARPED_MESH_FIXTURE_ID) {
        return;
      }
      sourceElementRef.current = element;
      if (!element) {
        projectorRef.current.clearSource(sourceId);
        textureManagerRef.current?.destroySurfaceTexture(sourceId);
        emitMetrics();
        return;
      }
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
      emitMetrics();
    },
    [emitMetrics],
  );

  const handleReady = useCallback(
    (runtime: GpuFlowRuntime) => {
      runtimeRef.current = runtime;
      pointerProjectionCleanupRef.current?.();
      pointerProjectionCleanupRef.current = null;
      textureManagerRef.current?.destroy();
      rendererRef.current?.destroy();
      textureManagerRef.current = createHtmlSurfaceTextureManager(runtime);
      rendererRef.current = new HtmlSurfaceRenderer(runtime);
      pointerProjectionCleanupRef.current =
        attachWarpedMeshFixturePointerProjection({
          emitMetrics,
          markDirty,
          projector: projectorRef.current,
          runtime,
          sourceElement: () => sourceElementRef.current,
          texture: () =>
            textureManagerRef.current?.getSurfaceTexture(
              HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
            ) ?? null,
          transformOnlyPaintRef,
          updateLastHit: (hit) => {
            lastHitRef.current = hit;
            if (hit) {
              pointerProjectionsRef.current += 1;
            }
          },
        });
      emitMetrics();
    },
    [emitMetrics, markDirty],
  );

  const handleResize = useCallback((_: GpuFlowRuntime, size: GpuCanvasSize) => {
    canvasSizeRef.current = size;
    surfaceRef.current?.requestFrame("resize");
  }, []);

  const handlePaint = useCallback(
    (_: GpuFlowRuntime, event: HtmlInCanvasPaintEvent) => {
      paintEventsRef.current += 1;
      const changedElements = event.changedElements ?? [];
      const sourceElement = sourceElementRef.current;
      const changedSource =
        sourceElement &&
        changedElements.some(
          (element) =>
            element === sourceElement || sourceElement.contains(element),
        );
      if (changedSource && transformOnlyPaintRef.current) {
        transformOnlyPaintRef.current = false;
        emitMetrics();
        return;
      }
      if (changedSource) {
        textureManagerRef.current?.markSurfaceTextureDirty({
          content: true,
          frame: nextFixtureFrame(frameRef),
          priority: "interactive",
          reason: "paint",
          requestPaint: false,
          surfaceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
        });
      }
      emitMetrics();
    },
    [emitMetrics],
  );

  const handleFrame = useCallback(
    (
      _: GpuFlowRuntime,
      event: { readonly reasons: readonly GpuFrameReason[] },
    ) => {
      const frameResult = renderWarpedMeshFixtureFrame({
        frame: nextFixtureFrame(frameRef),
        reasons: event.reasons,
        renderer: rendererRef.current,
        size: canvasSizeRef.current,
        sourceElement: sourceElementRef.current,
        textureManager: textureManagerRef.current,
      });
      if (!frameResult) {
        return;
      }
      textureUploadsRef.current += frameResult.uploadedCount;
      renderResultRef.current = frameResult.renderResult;
      if (frameResult.requestFollowupFrame) {
        surfaceRef.current?.requestFrame("texture-upload");
      }
      emitMetrics();
    },
    [emitMetrics],
  );

  const sources = useMemo(() => [WARPED_MESH_FIXTURE_SOURCE], []);

  useEffect(() => {
    const animationCaptureLease =
      createHtmlSurfaceAnimationCaptureLeaseController({
        getSourceElement: (surfaceId) =>
          surfaceId === HTML_SURFACE_WARPED_MESH_FIXTURE_ID
            ? sourceElementRef.current
            : null,
        markDirty: ({ reason, sourceRect, surfaceId }) => {
          if (surfaceId !== HTML_SURFACE_WARPED_MESH_FIXTURE_ID) {
            return false;
          }
          markDirty(reason, { scheduleFrame: false, sourceRect });
          return true;
        },
      });
    animationCaptureLeaseRef.current = animationCaptureLease;
    return () => {
      animationCaptureLease.destroy();
      if (animationCaptureLeaseRef.current === animationCaptureLease) {
        animationCaptureLeaseRef.current = null;
      }
    };
  }, [markDirty]);

  useEffect(() => {
    return () => {
      pointerProjectionCleanupRef.current?.();
      pointerProjectionCleanupRef.current = null;
      projectorRef.current.destroy();
      rendererRef.current?.destroy();
      rendererRef.current = null;
      textureManagerRef.current?.destroy();
      textureManagerRef.current = null;
      runtimeRef.current = null;
    };
  }, []);

  return (
    <div className={className} style={style}>
      <GpuSurface
        onFrame={handleFrame}
        onPaint={handlePaint}
        onReady={handleReady}
        onResize={handleResize}
        ref={surfaceRef}
      >
        <HtmlSurfaceSourceLayer
          configureSourceElement={configureSourceElement}
          getSourceId={(source) => source.surfaceId}
          onSourceElementChange={handleSourceElementChange}
          renderSource={renderSource}
          sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} setta-gpu-flow__warped-mesh-source-host`}
          sources={sources}
        />
      </GpuSurface>
    </div>
  );
}

function renderWarpedMeshFixtureFrame({
  frame,
  reasons,
  renderer,
  size,
  sourceElement,
  textureManager,
}: {
  readonly frame: number;
  readonly reasons: readonly GpuFrameReason[];
  readonly renderer: HtmlSurfaceRenderer | null;
  readonly size: GpuCanvasSize | null;
  readonly sourceElement: HTMLElement | null;
  readonly textureManager: HtmlSurfaceTextureManager | null;
}): {
  readonly renderResult: HtmlSurfaceWarpedMeshFixtureMetrics["renderResult"];
  readonly requestFollowupFrame: boolean;
  readonly uploadedCount: number;
} | null {
  if (!size || !sourceElement || !textureManager || !renderer) {
    return null;
  }
  textureManager.registerSurfaceTexture({
    cssHeight: HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.height,
    cssWidth: HTML_SURFACE_WARPED_MESH_FIXTURE_RECT.width,
    devicePixelRatio: size.devicePixelRatio,
    element: sourceElement,
    frame,
    priority: "interactive",
    surfaceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
    zoom: HTML_SURFACE_WARPED_MESH_FIXTURE_VIEWPORT[2],
  });
  const uploadResult = textureManager.uploadDirtySurfaceTextures({
    frame,
    maxBytes: DEFAULT_HTML_SURFACE_TEXTURE_UPLOAD_BUDGET_BYTES,
    maxDurationMs: 4,
    maxUploads: 2,
  });
  const texture = textureManager.getSurfaceTexture(
    HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
  );
  if (!texture || texture.lastUploadFrame < 0) {
    return {
      renderResult: null,
      requestFollowupFrame: uploadResult.budgetExhausted,
      uploadedCount: uploadResult.uploaded.length,
    };
  }
  const renderResult = renderer.render({
    canvasSize: size,
    scene: createHtmlSurfaceWarpedMeshFixtureScene({ texture }),
    viewport: HTML_SURFACE_WARPED_MESH_FIXTURE_VIEWPORT,
  });
  return {
    renderResult: {
      drawnSurfaceIds: renderResult.drawnSurfaceIds,
      vertexCount: renderResult.vertexCount,
    },
    requestFollowupFrame:
      uploadResult.budgetExhausted || reasons.includes("paint"),
    uploadedCount: uploadResult.uploaded.length,
  };
}

export function createHtmlSurfaceWarpedMeshFixtureScene({
  texture,
}: {
  readonly texture: HtmlSurfaceTextureRecord;
}): HtmlSurfaceVisualScene {
  return createHtmlSurfaceVisualScene({
    meshSurfaces: [
      createHtmlSurfaceWarpedMeshVisual({
        rect: HTML_SURFACE_WARPED_MESH_FIXTURE_RECT,
        surfaceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
        texture,
      }),
    ],
  });
}

export function createHtmlSurfaceWarpedMeshVisual({
  columns = 8,
  rect,
  rows = 5,
  surfaceId,
  texture,
  warpPx = 22,
}: {
  readonly columns?: number | undefined;
  readonly rect: FlowRect;
  readonly rows?: number | undefined;
  readonly surfaceId: string;
  readonly texture: HtmlSurfaceTextureRecord;
  readonly warpPx?: number | undefined;
}): HtmlSurfaceMeshVisual {
  const vertices = createWarpedMeshVertices({ columns, rect, rows, warpPx });
  return {
    bounds: resolveVertexBounds(vertices),
    indices: createWarpedMeshIndices({ columns, rows }),
    kind: "mesh",
    surfaceId,
    texture,
    vertices,
    zIndex: 0,
  };
}

export function resolveHtmlSurfaceWarpedMeshFixtureHit({
  clientX,
  clientY,
  surfaceElement,
  texture,
}: {
  readonly clientX: number;
  readonly clientY: number;
  readonly surfaceElement: HTMLElement;
  readonly texture: HtmlSurfaceTextureRecord;
}): HtmlSurfaceHitProjection | null {
  const scene = createHtmlSurfaceWarpedMeshFixtureScene({ texture });
  return resolveHtmlSurfaceHitAtClientPoint({
    clientX,
    clientY,
    scene: createHtmlSurfaceHitSceneFromVisualScene(scene),
    surfaceElement,
    viewport: HTML_SURFACE_WARPED_MESH_FIXTURE_VIEWPORT,
  });
}

function HtmlSurfaceWarpedMeshFixtureSourceView({
  onAnimationSettle,
  onAnimationStart,
  onDirty,
  setSourceState,
  state,
}: {
  readonly onAnimationSettle: (target: Element) => void;
  readonly onAnimationStart: (target: Element) => void;
  readonly onDirty: (reason: DirtyNodeReason) => void;
  readonly setSourceState: (
    updater: (
      state: HtmlSurfaceWarpedMeshFixtureSourceState,
    ) => HtmlSurfaceWarpedMeshFixtureSourceState,
  ) => void;
  readonly state: HtmlSurfaceWarpedMeshFixtureSourceState;
}) {
  const setStateAndDirty = useCallback(
    (
      updater: (
        state: HtmlSurfaceWarpedMeshFixtureSourceState,
      ) => HtmlSurfaceWarpedMeshFixtureSourceState,
      reason: DirtyNodeReason,
    ) => {
      setSourceState(updater);
      onDirty(reason);
    },
    [onDirty, setSourceState],
  );
  const handleAnimationStart = useCallback(
    (event: { readonly target: EventTarget | null }) => {
      if (event.target instanceof Element) {
        onAnimationStart(event.target);
      }
    },
    [onAnimationStart],
  );
  const handleAnimationSettle = useCallback(
    (event: { readonly target: EventTarget | null }) => {
      if (event.target instanceof Element) {
        onAnimationSettle(event.target);
      }
    },
    [onAnimationSettle],
  );

  return (
    <div
      className="setta-gpu-flow__warped-mesh-card"
      data-gpu-flow-control="warped-mesh-card"
      data-hovered={state.hovered ? "true" : "false"}
      onAnimationEnd={handleAnimationSettle}
      onAnimationStart={handleAnimationStart}
      onBlur={() =>
        setStateAndDirty((current) => ({ ...current, focused: false }), "focus")
      }
      onFocus={() =>
        setStateAndDirty((current) => ({ ...current, focused: true }), "focus")
      }
      onPointerEnter={() =>
        setStateAndDirty(
          (current) => ({ ...current, hovered: true }),
          "pointer",
        )
      }
      onPointerLeave={() =>
        setStateAndDirty(
          (current) => ({ ...current, hovered: false }),
          "pointer",
        )
      }
      onTransitionCancel={handleAnimationSettle}
      onTransitionEnd={handleAnimationSettle}
      onTransitionRun={handleAnimationStart}
      onTransitionStart={handleAnimationStart}
    >
      <button
        aria-pressed={state.buttonPressed}
        data-gpu-flow-control="warped-mesh-button"
        onClick={() =>
          setStateAndDirty(
            (current) => ({
              ...current,
              buttonPressed: !current.buttonPressed,
            }),
            "input",
          )
        }
        type="button"
      >
        {state.buttonPressed ? "On" : "Off"}
      </button>
      <button
        aria-checked={state.toggleEnabled}
        aria-label="Warped mesh animated switch"
        className="setta-gpu-flow__warped-mesh-switch"
        data-checked={state.toggleEnabled ? "true" : "false"}
        data-gpu-flow-control="warped-mesh-switch"
        onClick={() =>
          setStateAndDirty(
            (current) => ({
              ...current,
              toggleEnabled: !current.toggleEnabled,
            }),
            "input",
          )
        }
        role="switch"
        type="button"
      >
        <span className="setta-gpu-flow__warped-mesh-switch-thumb" />
      </button>
      <input
        aria-label="Warped mesh text"
        data-gpu-flow-control="warped-mesh-text"
        onChange={(event) =>
          setStateAndDirty(
            (current) => ({ ...current, textValue: event.target.value }),
            "input",
          )
        }
        type="text"
        value={state.textValue}
      />
      <input
        aria-label="Warped mesh slider"
        data-gpu-flow-control="warped-mesh-slider"
        max={100}
        min={0}
        onChange={(event) =>
          setStateAndDirty(
            (current) => ({
              ...current,
              sliderValue: Number(event.target.value),
            }),
            "input",
          )
        }
        type="range"
        value={state.sliderValue}
      />
      <output data-gpu-flow-control="warped-mesh-output">
        {state.sliderValue}
      </output>
    </div>
  );
}

function attachWarpedMeshFixturePointerProjection({
  emitMetrics,
  markDirty,
  projector,
  runtime,
  sourceElement,
  texture,
  transformOnlyPaintRef,
  updateLastHit,
}: {
  readonly emitMetrics: () => void;
  readonly markDirty: (reason: DirtyNodeReason) => void;
  readonly projector: HtmlSurfaceInteractionProjector;
  readonly runtime: GpuFlowRuntime;
  readonly sourceElement: () => HTMLElement | null;
  readonly texture: () => HtmlSurfaceTextureRecord | null;
  readonly transformOnlyPaintRef: { current: boolean };
  readonly updateLastHit: (hit: HtmlSurfaceHitProjection | null) => void;
}) {
  let projectedRangeInput: HTMLInputElement | null = null;

  const projectPointer = (event: PointerEvent) => {
    const source = sourceElement();
    const record = texture();
    if (!source || !record) {
      return null;
    }
    const hit = resolveHtmlSurfaceWarpedMeshFixtureHit({
      clientX: event.clientX,
      clientY: event.clientY,
      surfaceElement: runtime.canvas,
      texture: record,
    });
    updateLastHit(hit);
    if (!hit) {
      projector.clearSource(HTML_SURFACE_WARPED_MESH_FIXTURE_ID);
      emitMetrics();
      return null;
    }
    projector.alignSourceToClientPoint({
      localX: hit.localX,
      localY: hit.localY,
      sourceElement: source,
      sourceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
      surfaceX: hit.surfaceX,
      surfaceY: hit.surfaceY,
    });
    transformOnlyPaintRef.current = true;
    emitMetrics();
    return { hit, source };
  };

  const onPointerMove = (event: PointerEvent) => {
    const projection = projectPointer(event);
    if (
      projection &&
      projectedRangeInput &&
      event.buttons !== 0 &&
      !projectedRangeInput.matches(":active")
    ) {
      updateRangeInputFromClientX(projectedRangeInput, event.clientX);
      markDirty("input");
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    const projection = projectPointer(event);
    if (!projection) {
      return;
    }
    const target = resolveWarpedMeshFixtureTargetAtClientPoint(
      projection.source,
      event.clientX,
      event.clientY,
    );
    if (!target || isEventTargetInsideSource(projection.source, event.target)) {
      return;
    }
    if (target instanceof HTMLInputElement && target.type === "range") {
      projectedRangeInput = target;
      updateRangeInputFromClientX(target, event.clientX);
      markDirty("input");
      return;
    }
    if (isFocusableWarpedMeshFixtureTarget(target)) {
      target.focus({ preventScroll: true });
    }
    if (target instanceof HTMLButtonElement) {
      target.click();
    }
  };

  const onPointerUp = () => {
    projectedRangeInput = null;
  };

  runtime.canvas.addEventListener("pointermove", onPointerMove, {
    capture: true,
  });
  runtime.canvas.addEventListener("pointerdown", onPointerDown, {
    capture: true,
  });
  runtime.canvas.addEventListener("pointerup", onPointerUp, { capture: true });
  runtime.canvas.addEventListener("pointercancel", onPointerUp, {
    capture: true,
  });

  return () => {
    runtime.canvas.removeEventListener("pointermove", onPointerMove, {
      capture: true,
    });
    runtime.canvas.removeEventListener("pointerdown", onPointerDown, {
      capture: true,
    });
    runtime.canvas.removeEventListener("pointerup", onPointerUp, {
      capture: true,
    });
    runtime.canvas.removeEventListener("pointercancel", onPointerUp, {
      capture: true,
    });
  };
}

function isEventTargetInsideSource(
  source: HTMLElement,
  target: EventTarget | null,
): boolean {
  return target instanceof Node && source.contains(target);
}

function resolveWarpedMeshFixtureTargetAtClientPoint(
  source: HTMLElement,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  let match: HTMLElement | null = null;
  for (const candidate of source.querySelectorAll<HTMLElement>(
    "[data-gpu-flow-control]",
  )) {
    const rect = candidate.getBoundingClientRect();
    if (!rectContainsClientPoint(rect, clientX, clientY)) {
      continue;
    }
    if (isSmallerTargetMatch(rect, match)) {
      match = candidate;
    }
  }
  return match;
}

function isFocusableWarpedMeshFixtureTarget(target: HTMLElement): boolean {
  return (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target.tabIndex >= 0
  );
}

function updateRangeInputFromClientX(input: HTMLInputElement, clientX: number) {
  const rect = input.getBoundingClientRect();
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const ratio =
    rect.width <= 0
      ? 0
      : Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const value = String(Math.round(min + (max - min) * ratio));
  if (input.value === value) {
    return;
  }
  setNativeInputValue(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function rectContainsClientPoint(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    clientX >= rect.left &&
    clientX < rect.right &&
    clientY >= rect.top &&
    clientY < rect.bottom
  );
}

function isSmallerTargetMatch(
  rect: DOMRect,
  match: HTMLElement | null,
): boolean {
  return (
    !match || getRectArea(rect) < getRectArea(match.getBoundingClientRect())
  );
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  if (!descriptor?.set) {
    input.value = value;
    return;
  }
  descriptor.set.call(input, value);
}

function createWarpedMeshVertices({
  columns,
  rect,
  rows,
  warpPx,
}: {
  readonly columns: number;
  readonly rect: FlowRect;
  readonly rows: number;
  readonly warpPx: number;
}): readonly SurfaceVertex[] {
  const vertices: SurfaceVertex[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const wave = Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI) * warpPx;
      const sag = Math.sin(v * Math.PI) * warpPx * 0.35;
      vertices.push({
        u,
        v,
        x: rect.x + u * rect.width + wave,
        y: rect.y + v * rect.height + sag,
      });
    }
  }
  return vertices;
}

function createWarpedMeshIndices({
  columns,
  rows,
}: {
  readonly columns: number;
  readonly rows: number;
}): Uint32Array {
  const indices = new Uint32Array(columns * rows * 6);
  let offset = 0;
  const stride = columns + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * stride + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + stride;
      const bottomRight = bottomLeft + 1;
      indices[offset++] = topLeft;
      indices[offset++] = topRight;
      indices[offset++] = bottomLeft;
      indices[offset++] = bottomLeft;
      indices[offset++] = topRight;
      indices[offset++] = bottomRight;
    }
  }
  return indices;
}

function resolveVertexBounds(vertices: readonly SurfaceVertex[]): FlowRect {
  if (vertices.length === 0) {
    throw new Error("Setta warped mesh fixture requires at least one vertex.");
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
  }
  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  };
}

function getRectArea(rect: Pick<DOMRect, "height" | "width">): number {
  return rect.height * rect.width;
}

function nextFixtureFrame(frameRef: { current: number }): number {
  frameRef.current += 1;
  return frameRef.current;
}
