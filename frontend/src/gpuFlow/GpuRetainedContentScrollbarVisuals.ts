import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
} from "./GpuRetainedContentSurfaces";
import type {
  HtmlSurfaceColor,
  HtmlSurfaceSolidRoundedRectVisual,
} from "./htmlSurfaces/visualScene";
import {
  getGpuRetainedContentCanvasPalette,
  type GpuRetainedContentCanvasPalette,
} from "./retainedContentCanvasTheme";
import { getGpuRetainedContentSampledScrollOffset } from "./retainedContentRuntimeSampling";
import type { GpuRetainedContentScrollOffsetMap } from "./retainedContentScroll";
import {
  createGpuRetainedContentScrollbarLayouts,
  type GpuRetainedContentScrollbarAxis,
  type GpuRetainedContentScrollbarPart,
  type GpuRetainedContentScrollbarVisualState,
} from "./retainedContentScrollbar";
import {
  getGpuRetainedContentScrollbarThumbColor,
  getGpuRetainedContentScrollbarTrackColor,
  type GpuRetainedContentScrollbarColor,
} from "./retainedContentScrollbarColors";
import type { GpuContentSurface } from "./scene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentScrollbarVisualOptions = {
  readonly scrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly visualState?: GpuRetainedContentScrollbarVisualState | undefined;
};

export function getGpuRetainedContentScrollbarVisuals(
  surfaces: readonly GpuContentSurface[] | undefined,
  options: GpuRetainedContentScrollbarVisualOptions = {},
): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  assertGpuRetainedContentScrollbarSceneOnlyAccessAllowed();
  return getGpuRetainedContentScrollbarVisualsFromSourceSurfaces(
    getGpuRetainedContentSourceSurfaces(surfaces, {
      scrollOffsets: options.scrollOffsets,
    }),
    options,
  );
}

export function getGpuRetainedContentScrollbarVisualsFromSourceSurfaces(
  surfaces: readonly GpuRetainedContentSourceSurface[],
  options: GpuRetainedContentScrollbarVisualOptions = {},
): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  const palette = getGpuRetainedContentCanvasPalette(
    isGpuRetainedContentNativeScrollbarDarkMode(),
  );
  return surfaces.flatMap((surface) =>
    getGpuRetainedContentSurfaceScrollbarVisuals({
      palette,
      scrollOffsets: options.scrollOffsets,
      surface,
      visualState: options.visualState,
    }),
  );
}

function assertGpuRetainedContentScrollbarSceneOnlyAccessAllowed() {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return;
  }
  throw new Error(
    "Retained scrollbar visuals must be read from a sampled retained runtime frame.",
  );
}

function getGpuRetainedContentSurfaceScrollbarVisuals({
  palette,
  scrollOffsets,
  surface,
  visualState,
}: {
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly scrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly surface: GpuRetainedContentSourceSurface;
  readonly visualState?: GpuRetainedContentScrollbarVisualState | undefined;
}): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  const visuals: HtmlSurfaceSolidRoundedRectVisual[] = [];
  const scrollOffset = getGpuRetainedContentSampledScrollOffset({
    scrollOffsets,
    surface,
  });
  for (const layout of createGpuRetainedContentScrollbarLayouts({
    contentRect: surface.retainedScene.contentRect,
    scrollOffset,
    viewportRect: surface.retainedScene.viewportRect,
  })) {
    visuals.push(
      ...createGpuRetainedContentScrollbarCommandVisuals({
        axis: layout.axis,
        palette,
        surface,
        thumbRect: layout.thumbRect,
        trackRect: layout.trackRect,
        visualState,
      }),
    );
  }
  return visuals;
}

function createGpuRetainedContentScrollbarCommandVisuals({
  axis,
  palette,
  surface,
  thumbRect,
  trackRect,
  visualState,
}: {
  readonly axis: GpuRetainedContentScrollbarAxis;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly surface: GpuRetainedContentSourceSurface;
  readonly thumbRect: GpuRect;
  readonly trackRect: GpuRect;
  readonly visualState?: GpuRetainedContentScrollbarVisualState | undefined;
}): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  const trackActive = isGpuRetainedContentScrollbarVisualTargetActive({
    axis,
    part: "track",
    surfaceId: surface.id,
    visualState,
  });
  const trackHovered = isGpuRetainedContentScrollbarVisualTargetHovered({
    axis,
    part: "track",
    surfaceId: surface.id,
    visualState,
  });
  const thumbActive = isGpuRetainedContentScrollbarVisualTargetActive({
    axis,
    part: "thumb",
    surfaceId: surface.id,
    visualState,
  });
  const thumbHovered = isGpuRetainedContentScrollbarVisualTargetHovered({
    axis,
    part: "thumb",
    surfaceId: surface.id,
    visualState,
  });
  const trackRadius = axis === "y" ? trackRect.width / 2 : trackRect.height / 2;
  const thumbRadius = axis === "y" ? thumbRect.width / 2 : thumbRect.height / 2;
  const trackAlpha = trackActive ? 1 : trackHovered ? 0.94 : 0.86;
  return [
    createGpuRetainedContentScrollbarVisual({
      color: toHtmlSurfaceColor(
        getGpuRetainedContentScrollbarTrackColor({
          active: trackActive,
          hovered: trackHovered,
          palette,
        }),
        trackAlpha,
      ),
      localRect: trackRect,
      radius: trackRadius,
      surface,
      visualId: `${surface.id}:scrollbar:${axis}:track`,
    }),
    createGpuRetainedContentScrollbarVisual({
      color: toHtmlSurfaceColor(
        getGpuRetainedContentScrollbarThumbColor({
          active: thumbActive,
          hovered: thumbHovered,
          palette,
        }),
      ),
      localRect: thumbRect,
      radius: thumbRadius,
      surface,
      visualId: `${surface.id}:scrollbar:${axis}:thumb`,
    }),
  ].filter(
    (visual): visual is HtmlSurfaceSolidRoundedRectVisual => visual !== null,
  );
}

function isGpuRetainedContentScrollbarVisualTargetActive({
  axis,
  part,
  surfaceId,
  visualState,
}: {
  readonly axis: GpuRetainedContentScrollbarAxis;
  readonly part: GpuRetainedContentScrollbarPart;
  readonly surfaceId: string;
  readonly visualState?: GpuRetainedContentScrollbarVisualState | undefined;
}): boolean {
  return (
    visualState?.activeTarget?.axis === axis &&
    visualState.activeTarget.part === part &&
    visualState.activeTarget.surfaceId === surfaceId
  );
}

function isGpuRetainedContentScrollbarVisualTargetHovered({
  axis,
  part,
  surfaceId,
  visualState,
}: {
  readonly axis: GpuRetainedContentScrollbarAxis;
  readonly part: GpuRetainedContentScrollbarPart;
  readonly surfaceId: string;
  readonly visualState?: GpuRetainedContentScrollbarVisualState | undefined;
}): boolean {
  return (
    visualState?.hoveredTarget?.axis === axis &&
    visualState.hoveredTarget.part === part &&
    visualState.hoveredTarget.surfaceId === surfaceId
  );
}

function createGpuRetainedContentScrollbarVisual({
  color,
  localRect,
  radius,
  surface,
  visualId,
}: {
  readonly color: HtmlSurfaceColor;
  readonly localRect: GpuRect;
  readonly radius: number;
  readonly surface: GpuRetainedContentSourceSurface;
  readonly visualId: string;
}): HtmlSurfaceSolidRoundedRectVisual | null {
  const visibleLocalRect = {
    height: surface.rect.height,
    width: surface.rect.width,
    x: surface.sourceClipOffset.x,
    y: surface.sourceClipOffset.y,
  };
  const clippedLocalRect = intersectGpuRetainedContentRects(
    localRect,
    visibleLocalRect,
  );
  if (clippedLocalRect.width <= 0 || clippedLocalRect.height <= 0) {
    return null;
  }
  return {
    color,
    kind: "solid-rounded-rect",
    radius: Math.min(
      radius,
      clippedLocalRect.width / 2,
      clippedLocalRect.height / 2,
    ),
    rect: {
      height: clippedLocalRect.height,
      width: clippedLocalRect.width,
      x: surface.rect.x - surface.sourceClipOffset.x + clippedLocalRect.x,
      y: surface.rect.y - surface.sourceClipOffset.y + clippedLocalRect.y,
    },
    surfaceId: visualId,
    zIndex: surface.zIndex,
  };
}

function toHtmlSurfaceColor(
  color: GpuRetainedContentScrollbarColor,
  opacity = 1,
): HtmlSurfaceColor {
  return {
    a: color.a * opacity,
    b: color.b / 255,
    g: color.g / 255,
    r: color.r / 255,
  };
}

function isGpuRetainedContentNativeScrollbarDarkMode(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return Boolean(
    document.documentElement.closest(".dark") ??
      document.querySelector(".dark"),
  );
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
