import type {
  HtmlSurfaceColor,
  HtmlSurfaceSolidRoundedRectVisual,
} from "./htmlSurfaces/visualScene";
import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
} from "./GpuRetainedContentSurfaces";
import {
  getGpuRetainedContentCanvasPalette,
  type GpuRetainedContentCanvasPalette,
} from "./retainedContentCanvasTheme";
import type { GpuRetainedContentDrawCommand } from "./retainedContentScene";
import {
  getGpuRetainedContentScrollbarThumbColor,
  getGpuRetainedContentScrollbarTrackColor,
  type GpuRetainedContentScrollbarColor,
} from "./retainedContentScrollbarColors";
import type { GpuContentSurface } from "./scene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentScrollbarCommand = Extract<
  GpuRetainedContentDrawCommand,
  { kind: "scrollbar" }
>;

export function getGpuRetainedContentScrollbarVisuals(
  surfaces: readonly GpuContentSurface[] | undefined,
): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  const palette = getGpuRetainedContentCanvasPalette(
    isGpuRetainedContentNativeScrollbarDarkMode(),
  );
  return getGpuRetainedContentSourceSurfaces(surfaces).flatMap((surface) =>
    getGpuRetainedContentSurfaceScrollbarVisuals({ palette, surface }),
  );
}

function getGpuRetainedContentSurfaceScrollbarVisuals({
  palette,
  surface,
}: {
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly surface: GpuRetainedContentSourceSurface;
}): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  const visuals: HtmlSurfaceSolidRoundedRectVisual[] = [];
  for (const command of surface.retainedScene.drawCommands) {
    if (command.kind !== "scrollbar") {
      continue;
    }
    visuals.push(
      ...createGpuRetainedContentScrollbarCommandVisuals({
        command,
        palette,
        surface,
      }),
    );
  }
  return visuals;
}

function createGpuRetainedContentScrollbarCommandVisuals({
  command,
  palette,
  surface,
}: {
  readonly command: GpuRetainedContentScrollbarCommand;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly surface: GpuRetainedContentSourceSurface;
}): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  const trackActive = command.state?.activePart === "track";
  const trackHovered = command.state?.hoveredPart === "track";
  const thumbActive = command.state?.activePart === "thumb";
  const thumbHovered = command.state?.hoveredPart === "thumb";
  const trackRadius =
    command.axis === "y"
      ? command.trackRect.width / 2
      : command.trackRect.height / 2;
  const thumbRadius =
    command.axis === "y"
      ? command.thumbRect.width / 2
      : command.thumbRect.height / 2;
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
      localRect: command.trackRect,
      radius: trackRadius,
      surface,
      visualId: `${surface.id}:scrollbar:${command.axis}:track`,
    }),
    createGpuRetainedContentScrollbarVisual({
      color: toHtmlSurfaceColor(
        getGpuRetainedContentScrollbarThumbColor({
          active: thumbActive,
          hovered: thumbHovered,
          palette,
        }),
      ),
      localRect: command.thumbRect,
      radius: thumbRadius,
      surface,
      visualId: `${surface.id}:scrollbar:${command.axis}:thumb`,
    }),
  ].filter(
    (
      visual,
    ): visual is HtmlSurfaceSolidRoundedRectVisual => visual !== null,
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
