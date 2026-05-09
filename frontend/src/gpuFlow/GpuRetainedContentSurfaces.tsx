import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";

import {
  cancelGpuAnimationFrame,
  requestGpuAnimationFrame,
} from "./animationFrame";
import type { GpuHtmlSurfaceOverlayLayout } from "./htmlSurfaces/frame";
import {
  HTML_SURFACE_EXPLICIT_DIRTY_SOURCE_ATTRIBUTE,
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HTML_SURFACE_SOURCE_ID_ATTRIBUTE,
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
import type { GpuRetainedContentScene } from "./retainedContentScene";
import { createGpuRetainedRowContentSceneWithScrollWindow } from "./retainedContentScene";
import {
  getGpuRetainedContentSceneSourceInput,
  type GpuRetainedContentSceneSourceInput,
} from "./retainedContentSceneSourceMetadata";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import type { GpuContentSurface } from "./scene";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuRetainedContentSurfaceDrawEvent = {
  readonly reason: "animation" | "content";
  readonly sourceRect?: GpuRect | undefined;
};

export type GpuRetainedContentSurface = GpuContentSurface & {
  readonly retainedScene: GpuRetainedContentScene;
};

type GpuRetainedContentRenderableSource = {
  readonly sourceId: string;
  readonly surface: GpuRetainedContentSourceSurface;
};

export type GpuRetainedContentSourceSurface = GpuRetainedContentSurface & {
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
  const retainedSources = useMemo(
    () => getGpuRetainedContentRenderableSources(surfaces),
    [surfaces],
  );
  if (retainedSources.length === 0) {
    return null;
  }
  return (
    <>
      {retainedSources.map((source) => (
        <GpuRetainedContentCanvas
          key={source.sourceId}
          onSurfaceElementChange={onSurfaceElementChange}
          onSurfaceDraw={onSurfaceDraw}
          sourceId={source.sourceId}
          surface={source.surface}
          switchAnimations={switchAnimations}
        />
      ))}
    </>
  );
}

export function getGpuRetainedContentSurfaceLayouts(
  surfaces: readonly GpuContentSurface[] | undefined,
): readonly GpuHtmlSurfaceOverlayLayout[] {
  return getGpuRetainedContentRenderableSources(surfaces).map(
    toGpuRetainedContentSurfaceLayout,
  );
}

export function getGpuRetainedContentSourceIdsForSurface(
  surface: GpuContentSurface,
): readonly string[] {
  return getGpuRetainedContentSourceSurfaces([surface]).map(
    (source) => source.id,
  );
}

export function getGpuRetainedContentSourceRectForRows({
  rowIds,
  surface,
}: {
  readonly rowIds: Iterable<string>;
  readonly surface: GpuRetainedContentSurface;
}): GpuRect | null {
  const rowIdSet = new Set(rowIds);
  if (rowIdSet.size === 0) {
    return null;
  }
  const sourceSurface = clipGpuRetainedContentSourceSurface(surface);
  const sourceInput = getGpuRetainedContentSceneSourceInput(
    surface.retainedScene,
  );
  if (!sourceSurface || !sourceInput) {
    return null;
  }
  const textureBounds: GpuRect = {
    height: sourceSurface.textureWindow.textureHeight,
    width: sourceSurface.textureWindow.textureWidth,
    x: 0,
    y: 0,
  };
  let dirtyRect: GpuRect | null = null;
  for (const rowMetric of sourceInput.layout.rowMetrics) {
    if (!rowIdSet.has(rowMetric.input.id)) {
      continue;
    }
    const clippedRowRect = intersectGpuRetainedContentRects(
      {
        height: sourceInput.rowHeight,
        width: sourceSurface.textureWindow.cacheViewportRect.width,
        x:
          sourceSurface.textureWindow.cacheViewportRect.x -
          sourceSurface.textureWindow.cacheScrollOffset.x,
        y:
          sourceSurface.textureWindow.cacheViewportRect.y +
          rowMetric.y -
          sourceSurface.textureWindow.cacheScrollOffset.y,
      },
      textureBounds,
    );
    if (clippedRowRect.width <= 0 || clippedRowRect.height <= 0) {
      continue;
    }
    dirtyRect = dirtyRect
      ? unionGpuRetainedContentRects(dirtyRect, clippedRowRect)
      : clippedRowRect;
  }
  return dirtyRect;
}

function toGpuRetainedContentSurfaceLayout({
  sourceId,
  surface,
}: GpuRetainedContentRenderableSource): GpuHtmlSurfaceOverlayLayout {
  return {
    height: surface.rect.height,
    ownerNodeId: surface.ownerSectionId,
    surfaceId: sourceId,
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
  sourceId,
  switchAnimations,
}: {
  readonly element: HTMLElement;
  readonly nowMs?: number | undefined;
  readonly surface: GpuContentSurface;
  readonly sourceId?: string | undefined;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}): GpuRetainedContentSurfaceDrawEvent | null {
  const sourceSurface = getGpuRetainedContentSourceSurfaceForId({
    sourceId: sourceId ?? surface.id,
    surfaces: [surface],
  });
  if (!sourceSurface) {
    return null;
  }
  const canvas = getGpuRetainedContentCanvasElement(element);
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
  onSurfaceElementChange,
  onSurfaceDraw,
  sourceId,
  surface,
  switchAnimations,
}: {
  readonly onSurfaceElementChange?:
    | ((surfaceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly onSurfaceDraw?:
    | ((surfaceId: string, event: GpuRetainedContentSurfaceDrawEvent) => void)
    | undefined;
  readonly sourceId: string;
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
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    onSurfaceElementChange?.(sourceId, canvas);
    return () => {
      onSurfaceElementChange?.(sourceId, null);
    };
  }, [onSurfaceElementChange, sourceId]);

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
      {...getGpuRetainedContentSourceAttributes(sourceId)}
      aria-hidden="true"
      className={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_RETAINED_CONTENT_SOURCE_CLASS_NAME}`}
      data-gpu-flow-retained-content-canvas="true"
      data-gpu-flow-retained-content-id={surface.id}
      data-gpu-flow-retained-content-source="true"
      data-owner-section-id={surface.ownerSectionId}
      data-retained-content-source-kind="content"
      data-testid={`gpu-retained-content-source-${sourceId}`}
      ref={canvasRef}
      style={getGpuRetainedContentCanvasSourceStyle(surface)}
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
  ctx.restore();
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
    return null;
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

function getGpuRetainedContentRenderableSources(
  surfaces: readonly GpuContentSurface[] | undefined,
): readonly GpuRetainedContentRenderableSource[] {
  return getGpuRetainedContentSourceSurfaces(surfaces).map((surface) => ({
    sourceId: surface.id,
    surface,
  }));
}

function getGpuRetainedContentSourceSurfaceForId({
  sourceId,
  surfaces,
}: {
  readonly sourceId: string;
  readonly surfaces: readonly GpuContentSurface[] | undefined;
}): GpuRetainedContentSourceSurface | null {
  return (
    getGpuRetainedContentSourceSurfaces(surfaces).find(
      (surface) => surface.id === sourceId,
    ) ?? null
  );
}

export function getGpuRetainedContentSourceSurfaces(
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

function getGpuRetainedContentCanvasSourceStyle(
  surface: GpuRetainedContentSourceSurface,
): CSSProperties {
  return {
    contain: "layout paint style",
    display: "block",
    height: surface.textureWindow.textureHeight,
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    transformOrigin: "0 0",
    width: surface.textureWindow.textureWidth,
  };
}

function getGpuRetainedContentSourceAttributes(sourceId: string) {
  return {
    [HTML_SURFACE_EXPLICIT_DIRTY_SOURCE_ATTRIBUTE]: "true",
    [HTML_SURFACE_SOURCE_ID_ATTRIBUTE]: sourceId,
    "data-gpu-flow-html-source": "true",
  };
}

function getGpuRetainedContentCanvasElement(
  element: HTMLElement,
): HTMLCanvasElement | null {
  if (
    element.tagName.toLowerCase() === "canvas" &&
    element.dataset.gpuFlowRetainedContentCanvas === "true"
  ) {
    return element as HTMLCanvasElement;
  }
  return element.querySelector<HTMLCanvasElement>(
    '[data-gpu-flow-retained-content-canvas="true"]',
  );
}

export function clipGpuRetainedContentSourceSurface(
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
      areGpuRetainedContentCacheValuesEqual(
        left.sourceInput,
        right.sourceInput,
      ) &&
      left.textureHeight === right.textureHeight &&
      left.textureWidth === right.textureWidth,
  );
}

function areGpuRetainedContentCacheValuesEqual(
  left: unknown,
  right: unknown,
): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (!areComparableGpuRetainedContentCacheObjects(left, right)) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return areGpuRetainedContentCacheArraysEqual(left, right);
  }
  return areGpuRetainedContentCacheRecordsEqual(left, right);
}

function areComparableGpuRetainedContentCacheObjects(
  left: unknown,
  right: unknown,
): boolean {
  return (
    typeof left === typeof right &&
    Boolean(left) &&
    Boolean(right) &&
    typeof left === "object"
  );
}

function areGpuRetainedContentCacheArraysEqual(
  left: unknown,
  right: unknown,
): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) =>
    areGpuRetainedContentCacheValuesEqual(value, right[index]),
  );
}

function areGpuRetainedContentCacheRecordsEqual(
  left: unknown,
  right: unknown,
): boolean {
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  if (leftKeys.length !== Object.keys(rightRecord).length) {
    return false;
  }
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      areGpuRetainedContentCacheValuesEqual(leftRecord[key], rightRecord[key]),
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

function unionGpuRetainedContentRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);
  return {
    height: maxY - y,
    width: maxX - x,
    x,
    y,
  };
}

function getGpuRetainedContentDevicePixelRatio(): number {
  return Math.max(1, globalThis.devicePixelRatio || 1);
}
