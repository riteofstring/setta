import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";

import {
  cancelGpuAnimationFrame,
  requestGpuAnimationFrame,
} from "./animationFrame";
import type { GpuHtmlSurfaceOverlayLayout } from "./htmlSurfaces/frame";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "./htmlSurfaces/sourceLayer";
import {
  drawGpuRetainedContentCommand,
  drawGpuRetainedContentPortAnchors,
} from "./retainedContentCanvasCommands";
import {
  getGpuRetainedContentCanvasPalette,
  isGpuRetainedContentCanvasDarkMode,
  type GpuRetainedContentCanvasPalette,
} from "./retainedContentCanvasTheme";
import type {
  GpuRetainedContentDrawCommand,
  GpuRetainedContentScene,
} from "./retainedContentScene";
import { createGpuRetainedRowContentSceneWithScrollWindow } from "./retainedContentScene";
import {
  getGpuRetainedContentSceneSourceInput,
  type GpuRetainedContentSceneSourceInput,
} from "./retainedContentSceneSourceMetadata";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import type { GpuContentSurface } from "./scene";
import type { GpuPoint, GpuRect } from "./viewportMath";

type GpuRetainedContentSurface = GpuContentSurface & {
  readonly retainedScene: GpuRetainedContentScene;
};

type GpuRetainedContentSourceSurface = GpuRetainedContentSurface & {
  readonly sourceClipOffset: GpuPoint;
  readonly textureWindow: GpuRetainedContentTextureWindow;
};

type GpuRetainedContentTextureWindow = {
  readonly cacheScrollOffset: GpuPoint;
  readonly cacheViewportRect: GpuRect;
  readonly sourceRect: GpuRect;
  readonly textureHeight: number;
  readonly textureWidth: number;
};

type GpuRetainedContentCanvasCacheKey = {
  readonly cacheScrollX: number;
  readonly cacheScrollY: number;
  readonly darkMode: boolean;
  readonly sourceClipX: number;
  readonly sourceClipY: number;
  readonly sourceInput: GpuRetainedContentSceneSourceInput;
  readonly textureHeight: number;
  readonly textureWidth: number;
};

type GpuRetainedContentSurfaceLayerProps = {
  readonly onSurfaceDraw?:
    | ((surfaceId: string, event: GpuRetainedContentSurfaceDrawEvent) => void)
    | undefined;
  readonly onSurfaceElementChange?:
    | ((surfaceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly surfaces: readonly GpuContentSurface[] | undefined;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
};

export type GpuRetainedContentSurfaceDrawEvent = {
  readonly reason: "animation" | "content";
  readonly sourceRect?: GpuRect | undefined;
};

const GPU_RETAINED_CONTENT_SOURCE_CLASS_NAME =
  "setta-gpu-flow__retained-content-source";
const gpuRetainedContentCanvasCacheKeys = new WeakMap<
  HTMLCanvasElement,
  GpuRetainedContentCanvasCacheKey
>();

export function GpuRetainedContentSurfaceLayer({
  onSurfaceDraw,
  onSurfaceElementChange,
  surfaces,
  switchAnimations,
}: GpuRetainedContentSurfaceLayerProps) {
  const retainedSurfaces = useMemo(
    () => getGpuRetainedContentSourceSurfaces(surfaces),
    [surfaces],
  );
  if (retainedSurfaces.length === 0) {
    return null;
  }
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureGpuRetainedContentSourceElement}
      getSourceId={getGpuRetainedContentSurfaceId}
      onSourceElementChange={onSurfaceElementChange}
      renderSource={(surface) => (
        <GpuRetainedContentCanvas
          onSurfaceDraw={onSurfaceDraw}
          surface={surface}
          switchAnimations={switchAnimations}
        />
      )}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_RETAINED_CONTENT_SOURCE_CLASS_NAME}`}
      sources={retainedSurfaces}
    />
  );
}

export function getGpuRetainedContentSurfaceLayouts(
  surfaces: readonly GpuContentSurface[] | undefined,
): readonly GpuHtmlSurfaceOverlayLayout[] {
  return getGpuRetainedContentSourceSurfaces(surfaces).map(
    toGpuRetainedContentSurfaceLayout,
  );
}

function toGpuRetainedContentSurfaceLayout(
  surface: GpuRetainedContentSourceSurface,
): GpuHtmlSurfaceOverlayLayout {
  return {
    height: surface.rect.height,
    ownerNodeId: surface.ownerSectionId,
    surfaceId: surface.id,
    textureCssHeight: surface.textureWindow.textureHeight,
    textureCssWidth: surface.textureWindow.textureWidth,
    textureSourceRect: surface.textureWindow.sourceRect,
    width: surface.rect.width,
    x: surface.rect.x,
    y: surface.rect.y,
    zIndex: surface.zIndex,
  };
}

export function getGpuRetainedContentSourceStyle(
  surface: GpuRetainedContentSurface,
): CSSProperties {
  const sourceSurface = clipGpuRetainedContentSourceSurface(surface);
  return {
    height: sourceSurface?.textureWindow.textureHeight ?? 0,
    width: sourceSurface?.textureWindow.textureWidth ?? 0,
  };
}

export function redrawGpuRetainedContentSourceElement({
  element,
  nowMs,
  surface,
  switchAnimations,
}: {
  readonly element: HTMLElement;
  readonly nowMs?: number | undefined;
  readonly surface: GpuContentSurface;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}): GpuRetainedContentSurfaceDrawEvent | null {
  if (!isGpuRetainedContentSurface(surface)) {
    return null;
  }
  const sourceSurface = clipGpuRetainedContentSourceSurface(surface);
  if (!sourceSurface) {
    return null;
  }
  const canvas = element.querySelector<HTMLCanvasElement>(
    '[data-gpu-flow-retained-content-canvas="true"]',
  );
  if (!canvas) {
    return null;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  return redrawGpuRetainedContentSourceCanvas({
    canvas,
    ctx,
    nowMs,
    reason: "content",
    sourceSurface,
    switchAnimations,
  });
}

function GpuRetainedContentCanvas({
  onSurfaceDraw,
  surface,
  switchAnimations,
}: {
  readonly onSurfaceDraw?:
    | ((surfaceId: string, event: GpuRetainedContentSurfaceDrawEvent) => void)
    | undefined;
  readonly surface: GpuRetainedContentSourceSurface;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    return () => {
      switchAnimations?.clearSurface(surface.id);
    };
  }, [surface.id, switchAnimations]);

  useLayoutEffect(() => {
    const cancelPendingAnimationFrame = () => {
      const frameId = animationFrameRef.current;
      if (frameId === null) {
        return;
      }
      cancelGpuAnimationFrame(frameId);
      animationFrameRef.current = null;
    };
    const canvas = canvasRef.current;
    if (!canvas) {
      cancelPendingAnimationFrame();
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      cancelPendingAnimationFrame();
      return;
    }
    const sourceSurface = clipGpuRetainedContentSourceSurface(surface);
    if (!sourceSurface) {
      cancelPendingAnimationFrame();
      return;
    }
    const drawSource = (
      nowMs: number,
      reason: GpuRetainedContentSurfaceDrawEvent["reason"],
    ) => {
      const drawEvent = redrawGpuRetainedContentSourceCanvas({
        canvas,
        ctx,
        nowMs,
        reason,
        sourceSurface,
        switchAnimations,
      });
      if (drawEvent) {
        onSurfaceDraw?.(sourceSurface.id, drawEvent);
      }
    };
    const scheduleAnimationFrame = () => {
      if (!switchAnimations || animationFrameRef.current !== null) {
        return;
      }
      animationFrameRef.current = requestGpuAnimationFrame((timestamp) => {
        animationFrameRef.current = null;
        drawSource(timestamp, "animation");
        if (switchAnimations.hasActiveSurface(sourceSurface.id, timestamp)) {
          scheduleAnimationFrame();
        }
      });
    };

    drawSource(getGpuRetainedContentSourceNowMs(), "content");
    if (switchAnimations?.hasActiveSurface(sourceSurface.id)) {
      scheduleAnimationFrame();
    }
    return cancelPendingAnimationFrame;
  }, [
    onSurfaceDraw,
    surface.id,
    surface.ownerSectionId,
    surface.rect.height,
    surface.rect.width,
    surface.rect.x,
    surface.rect.y,
    surface.retainedScene,
    surface.sourceClipOffset.x,
    surface.sourceClipOffset.y,
    surface.textureWindow.cacheScrollOffset.x,
    surface.textureWindow.cacheScrollOffset.y,
    surface.textureWindow.sourceRect.height,
    surface.textureWindow.sourceRect.width,
    surface.textureWindow.sourceRect.x,
    surface.textureWindow.sourceRect.y,
    surface.textureWindow.textureHeight,
    surface.textureWindow.textureWidth,
    switchAnimations,
  ]);

  return (
    <canvas
      aria-hidden="true"
      data-gpu-flow-retained-content-canvas="true"
      data-gpu-flow-retained-content-id={surface.id}
      ref={canvasRef}
      style={getGpuRetainedContentCanvasStyle(surface)}
    />
  );
}

function drawGpuRetainedContentSurface(
  ctx: CanvasRenderingContext2D,
  surface: GpuRetainedContentSourceSurface,
  {
    nowMs,
    palette,
    switchAnimations,
  }: {
    readonly nowMs: number | undefined;
    readonly palette: GpuRetainedContentCanvasPalette;
    readonly switchAnimations?:
      | GpuRetainedContentSwitchAnimationStore
      | undefined;
  },
) {
  const scene = createGpuRetainedRowContentSceneWithScrollWindow({
    scene: surface.retainedScene,
    scrollOffset: surface.textureWindow.cacheScrollOffset,
    viewportRect: surface.textureWindow.cacheViewportRect,
  });
  const width = Math.max(0, surface.textureWindow.textureWidth);
  const height = Math.max(0, surface.textureWindow.textureHeight);
  const rowStateById = new Map(scene.rows.map((row) => [row.id, row.state]));

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.fillStyle = palette.surfaceBackground;
  ctx.fillRect(0, 0, width, height);

  for (const command of scene.drawCommands) {
    if (command.kind === "scrollbar") {
      continue;
    }
    drawGpuRetainedContentCommand({
      command,
      ctx,
      nowMs,
      palette,
      rowState: rowStateById.get(command.rowId),
      surfaceId: surface.id,
      switchAnimations,
    });
  }
  drawGpuRetainedContentPortAnchors(ctx, scene);
  drawGpuRetainedContentCurrentScrollbars({
    ctx,
    nowMs,
    palette,
    scrollDeltaY:
      surface.retainedScene.scrollOffset.y -
      surface.textureWindow.cacheScrollOffset.y,
    surface,
    switchAnimations,
  });
  ctx.restore();
}

function drawGpuRetainedContentCurrentScrollbars({
  ctx,
  nowMs,
  palette,
  scrollDeltaY,
  surface,
  switchAnimations,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly nowMs: number | undefined;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly scrollDeltaY: number;
  readonly surface: GpuRetainedContentSourceSurface;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}) {
  if (!surface.retainedScene.drawCommands.some(isGpuRetainedContentScrollbar)) {
    return;
  }
  ctx.save();
  ctx.translate(0, scrollDeltaY);
  for (const command of surface.retainedScene.drawCommands) {
    if (!isGpuRetainedContentScrollbar(command)) {
      continue;
    }
    drawGpuRetainedContentCommand({
      command,
      ctx,
      nowMs,
      palette,
      rowState: undefined,
      surfaceId: surface.id,
      switchAnimations,
    });
  }
  ctx.restore();
}

function redrawGpuRetainedContentScrollbarStrip({
  ctx,
  nowMs,
  palette,
  surface,
  switchAnimations,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly nowMs: number | undefined;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly surface: GpuRetainedContentSourceSurface;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}): GpuRect | null {
  const sourceRect = resolveGpuRetainedContentScrollbarSourceRect(surface);
  if (!sourceRect) {
    return null;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height);
  ctx.clip();
  ctx.clearRect(
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
  );
  ctx.fillStyle = palette.surfaceBackground;
  ctx.fillRect(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height);
  drawGpuRetainedContentCurrentScrollbars({
    ctx,
    nowMs,
    palette,
    scrollDeltaY:
      surface.retainedScene.scrollOffset.y -
      surface.textureWindow.cacheScrollOffset.y,
    surface,
    switchAnimations,
  });
  ctx.restore();

  return sourceRect;
}

function resolveGpuRetainedContentScrollbarSourceRect(
  surface: GpuRetainedContentSourceSurface,
): GpuRect | null {
  let sourceRect: GpuRect | null = null;
  const scrollDeltaY =
    surface.retainedScene.scrollOffset.y -
    surface.textureWindow.cacheScrollOffset.y;
  for (const command of surface.retainedScene.drawCommands) {
    if (!isGpuRetainedContentScrollbar(command)) {
      continue;
    }
    const trackRect = expandGpuRect(
      offsetGpuRect(command.trackRect, { x: 0, y: scrollDeltaY }),
      2,
    );
    const thumbRect = expandGpuRect(
      offsetGpuRect(command.thumbRect, { x: 0, y: scrollDeltaY }),
      2,
    );
    sourceRect = sourceRect ? unionGpuRects(sourceRect, trackRect) : trackRect;
    sourceRect = unionGpuRects(sourceRect, thumbRect);
  }
  if (!sourceRect) {
    return null;
  }
  const visibleRect = intersectGpuRetainedContentRects(
    sourceRect,
    surface.textureWindow.sourceRect,
  );
  return visibleRect.width > 0 && visibleRect.height > 0 ? visibleRect : null;
}

function isGpuRetainedContentScrollbar(
  command: GpuRetainedContentDrawCommand,
): boolean {
  return command.kind === "scrollbar";
}

function redrawGpuRetainedContentSourceCanvas({
  canvas,
  ctx,
  nowMs,
  reason,
  sourceSurface,
  switchAnimations,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly nowMs?: number | undefined;
  readonly reason: GpuRetainedContentSurfaceDrawEvent["reason"];
  readonly sourceSurface: GpuRetainedContentSourceSurface;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}): GpuRetainedContentSurfaceDrawEvent | null {
  prepareGpuRetainedContentCanvas(canvas, sourceSurface);
  const darkMode = isGpuRetainedContentCanvasDarkMode(canvas);
  const palette = getGpuRetainedContentCanvasPalette(darkMode);
  switchAnimations?.syncSurface(sourceSurface, nowMs);
  if (reason === "animation") {
    drawGpuRetainedContentFullSourceCanvas({
      canvas,
      ctx,
      darkMode,
      nowMs,
      palette,
      sourceSurface,
      switchAnimations,
    });
    return { reason };
  }

  const nextCacheKey = createGpuRetainedContentCanvasCacheKey({
    darkMode,
    sourceSurface,
  });
  const cacheHit =
    nextCacheKey &&
    isGpuRetainedContentCanvasCacheKeyEqual(
      gpuRetainedContentCanvasCacheKeys.get(canvas),
      nextCacheKey,
    ) &&
    !switchAnimations?.hasActiveSurface(sourceSurface.id, nowMs);
  if (cacheHit) {
    const sourceRect = redrawGpuRetainedContentScrollbarStrip({
      ctx,
      nowMs,
      palette,
      surface: sourceSurface,
      switchAnimations,
    });
    return sourceRect ? { reason, sourceRect } : null;
  }

  drawGpuRetainedContentFullSourceCanvas({
    canvas,
    ctx,
    darkMode,
    nowMs,
    palette,
    sourceSurface,
    switchAnimations,
  });
  return { reason };
}

function drawGpuRetainedContentFullSourceCanvas({
  canvas,
  ctx,
  darkMode,
  nowMs,
  palette,
  sourceSurface,
  switchAnimations,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly darkMode: boolean;
  readonly nowMs: number | undefined;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly sourceSurface: GpuRetainedContentSourceSurface;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}) {
  drawGpuRetainedContentSurface(ctx, sourceSurface, {
    nowMs,
    palette,
    switchAnimations,
  });
  const cacheKey = createGpuRetainedContentCanvasCacheKey({
    darkMode,
    sourceSurface,
  });
  if (cacheKey) {
    gpuRetainedContentCanvasCacheKeys.set(canvas, cacheKey);
  } else {
    gpuRetainedContentCanvasCacheKeys.delete(canvas);
  }
}

function getGpuRetainedContentSourceNowMs(): number {
  if (
    typeof globalThis.performance !== "undefined" &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

function configureGpuRetainedContentSourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuRetainedContentSourceSurface>) {
  host.dataset.gpuFlowRetainedContentSource = "true";
  host.dataset.ownerSectionId = source.ownerSectionId;
  host.setAttribute("data-testid", `gpu-retained-content-source-${source.id}`);
  const style = getGpuRetainedContentSourceStyle(source);
  host.style.height = `${style.height}px`;
  host.style.overflow = "hidden";
  host.style.width = `${style.width}px`;
}

function getGpuRetainedContentSurfaceId(
  surface: GpuRetainedContentSourceSurface,
): string {
  return surface.id;
}

function getGpuRetainedContentSourceSurfaces(
  surfaces: readonly GpuContentSurface[] | undefined,
): readonly GpuRetainedContentSourceSurface[] {
  return (surfaces ?? [])
    .filter(isGpuRetainedContentSurface)
    .map(clipGpuRetainedContentSourceSurface)
    .filter((surface): surface is GpuRetainedContentSourceSurface =>
      Boolean(surface),
    );
}

function isGpuRetainedContentSurface(
  surface: GpuContentSurface,
): surface is GpuRetainedContentSurface {
  return (
    surface.renderer.kind === "canvas-content" &&
    Boolean(surface.retainedScene) &&
    surface.rect.width > 0 &&
    surface.rect.height > 0
  );
}

function prepareGpuRetainedContentCanvas(
  canvas: HTMLCanvasElement,
  surface: GpuRetainedContentSourceSurface,
) {
  const dpr = getGpuRetainedContentDevicePixelRatio();
  const cssWidth = Math.max(0, surface.textureWindow.textureWidth);
  const cssHeight = Math.max(0, surface.textureWindow.textureHeight);
  const pixelWidth = Math.max(1, Math.ceil(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.ceil(cssHeight * dpr));
  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth;
  }
  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight;
  }
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getGpuRetainedContentCanvasStyle(
  surface: GpuRetainedContentSourceSurface,
): CSSProperties {
  return {
    display: "block",
    height: surface.textureWindow.textureHeight,
    width: surface.textureWindow.textureWidth,
  };
}

function clipGpuRetainedContentSourceSurface(
  surface: GpuRetainedContentSurface,
): GpuRetainedContentSourceSurface | null {
  const rect = intersectGpuRetainedContentRects(surface.rect, surface.clipRect);
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const previousOffset =
    "sourceClipOffset" in surface
      ? (surface.sourceClipOffset as GpuPoint)
      : { x: 0, y: 0 };
  const sourceClipOffset = {
    x: previousOffset.x + rect.x - surface.rect.x,
    y: previousOffset.y + rect.y - surface.rect.y,
  };
  return {
    ...surface,
    rect,
    sourceClipOffset,
    textureWindow: resolveGpuRetainedContentTextureWindow({
      rect,
      scene: surface.retainedScene,
      sourceClipOffset,
    }),
  };
}

function resolveGpuRetainedContentTextureWindow({
  rect,
  scene,
  sourceClipOffset,
}: {
  readonly rect: GpuRect;
  readonly scene: GpuRetainedContentScene;
  readonly sourceClipOffset: GpuPoint;
}): GpuRetainedContentTextureWindow {
  const viewportHeight = Math.max(1, scene.viewportRect.height);
  const contentHeight = Math.max(viewportHeight, scene.contentRect.height);
  const cacheHeight = resolveGpuRetainedContentTextureCacheHeight({
    contentHeight,
    rowHeight: scene.rowHeight,
    viewportHeight,
  });
  const maxScrollY = Math.max(0, contentHeight - viewportHeight);
  const scrollY = clampGpuRetainedContentNumber(
    scene.scrollOffset.y,
    0,
    maxScrollY,
  );
  const maxCacheTop = Math.max(0, contentHeight - cacheHeight);
  const cacheStride = Math.max(1, cacheHeight - viewportHeight);
  const cacheTop = clampGpuRetainedContentNumber(
    Math.floor(scrollY / cacheStride) * cacheStride,
    0,
    maxCacheTop,
  );
  const sourceRect = {
    height: rect.height,
    width: rect.width,
    x: sourceClipOffset.x,
    y: sourceClipOffset.y + scrollY - cacheTop,
  };
  const textureHeight = Math.max(
    sourceRect.y + sourceRect.height,
    Math.min(contentHeight - cacheTop + sourceClipOffset.y, cacheHeight),
  );
  const textureWidth = Math.max(
    sourceRect.x + sourceRect.width,
    scene.viewportRect.width,
  );
  return {
    cacheScrollOffset: {
      x: scene.scrollOffset.x,
      y: cacheTop,
    },
    cacheViewportRect: {
      ...scene.viewportRect,
      height: textureHeight,
    },
    sourceRect,
    textureHeight,
    textureWidth,
  };
}

function resolveGpuRetainedContentTextureCacheHeight({
  contentHeight,
  rowHeight,
  viewportHeight,
}: {
  readonly contentHeight: number;
  readonly rowHeight: number;
  readonly viewportHeight: number;
}): number {
  if (contentHeight <= viewportHeight) {
    return viewportHeight;
  }
  return Math.min(
    contentHeight,
    Math.max(viewportHeight * 6, viewportHeight + rowHeight * 48),
  );
}

function createGpuRetainedContentCanvasCacheKey({
  darkMode,
  sourceSurface,
}: {
  readonly darkMode: boolean;
  readonly sourceSurface: GpuRetainedContentSourceSurface;
}): GpuRetainedContentCanvasCacheKey | null {
  const sourceInput = getGpuRetainedContentSceneSourceInput(
    sourceSurface.retainedScene,
  );
  if (!sourceInput) {
    return null;
  }
  return {
    cacheScrollX: sourceSurface.textureWindow.cacheScrollOffset.x,
    cacheScrollY: sourceSurface.textureWindow.cacheScrollOffset.y,
    darkMode,
    sourceClipX: sourceSurface.sourceClipOffset.x,
    sourceClipY: sourceSurface.sourceClipOffset.y,
    sourceInput,
    textureHeight: sourceSurface.textureWindow.textureHeight,
    textureWidth: sourceSurface.textureWindow.textureWidth,
  };
}

function isGpuRetainedContentCanvasCacheKeyEqual(
  left: GpuRetainedContentCanvasCacheKey | undefined,
  right: GpuRetainedContentCanvasCacheKey,
): boolean {
  return Boolean(
    left &&
      left.cacheScrollX === right.cacheScrollX &&
      left.cacheScrollY === right.cacheScrollY &&
      left.darkMode === right.darkMode &&
      left.sourceClipX === right.sourceClipX &&
      left.sourceClipY === right.sourceClipY &&
      left.sourceInput === right.sourceInput &&
      left.textureHeight === right.textureHeight &&
      left.textureWidth === right.textureWidth,
  );
}

function clampGpuRetainedContentNumber(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, value));
}

function intersectGpuRetainedContentRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect {
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
  return { height, width, x, y };
}

function offsetGpuRect(rect: GpuRect, offset: GpuPoint): GpuRect {
  return {
    height: rect.height,
    width: rect.width,
    x: rect.x + offset.x,
    y: rect.y + offset.y,
  };
}

function expandGpuRect(rect: GpuRect, amount: number): GpuRect {
  return {
    height: rect.height + amount * 2,
    width: rect.width + amount * 2,
    x: rect.x - amount,
    y: rect.y - amount,
  };
}

function unionGpuRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const rightEdge = Math.max(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.max(left.y + left.height, right.y + right.height);
  return {
    height: bottomEdge - y,
    width: rightEdge - x,
    x,
    y,
  };
}

function getGpuRetainedContentDevicePixelRatio(): number {
  return Math.max(1, globalThis.devicePixelRatio || 1);
}
