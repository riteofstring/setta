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
import { getGpuRetainedContentSceneSourceInput } from "./retainedContentSceneSourceMetadata";
import type { GpuRetainedContentScrollOffsetMap } from "./retainedContentScroll";
import type { GpuFlowScene } from "./scene";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuRetainedContentRowHoverTarget = {
  readonly rowId: string;
  readonly surfaceId: string;
};

export function getGpuRetainedContentRowHoverVisuals({
  scene,
  scrollOffsets,
  target,
}: {
  readonly scene: GpuFlowScene | undefined;
  readonly scrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
  readonly target: GpuRetainedContentRowHoverTarget | null;
}): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  if (!scene || !target) {
    return [];
  }
  const palette = getGpuRetainedContentCanvasPalette(
    isGpuRetainedContentRowHoverDarkMode(),
  );
  const visuals: HtmlSurfaceSolidRoundedRectVisual[] = [];
  for (const surface of getGpuRetainedContentSourceSurfaces(
    scene.contentSurfaces,
    { scrollOffsets },
  )) {
    if (surface.id !== target.surfaceId) {
      continue;
    }
    const visual = createGpuRetainedContentRowHoverVisual({
      palette,
      rowId: target.rowId,
      scrollOffset: getGpuRetainedContentSampledScrollOffset({
        scrollOffsets,
        surface,
      }),
      surface,
    });
    if (visual) {
      visuals.push(visual);
    }
  }
  return visuals;
}

export function getGpuRetainedContentRowHoverStateVisuals({
  scene,
  scrollOffsets,
}: {
  readonly scene: GpuFlowScene | undefined;
  readonly scrollOffsets?: GpuRetainedContentScrollOffsetMap | undefined;
}): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  if (!scene) {
    return [];
  }
  const palette = getGpuRetainedContentCanvasPalette(
    isGpuRetainedContentRowHoverDarkMode(),
  );
  const visuals: HtmlSurfaceSolidRoundedRectVisual[] = [];
  for (const surface of getGpuRetainedContentSourceSurfaces(
    scene.contentSurfaces,
    { scrollOffsets },
  )) {
    for (const row of surface.retainedScene.rows) {
      if (!row.state.hovered) {
        continue;
      }
      const visual = createGpuRetainedContentRowHoverVisual({
        palette,
        rowId: row.id,
        scrollOffset: getGpuRetainedContentSampledScrollOffset({
          scrollOffsets,
          surface,
        }),
        surface,
      });
      if (visual) {
        visuals.push(visual);
      }
    }
  }
  return visuals;
}

function createGpuRetainedContentRowHoverVisual({
  palette,
  rowId,
  scrollOffset,
  surface,
}: {
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rowId: string;
  readonly scrollOffset: GpuPoint;
  readonly surface: GpuRetainedContentSourceSurface;
}): HtmlSurfaceSolidRoundedRectVisual | null {
  const rowVisualRect = resolveGpuRetainedContentRowHoverVisualRect({
    rowId,
    scrollOffset,
    surface,
  });
  if (!rowVisualRect) {
    return null;
  }
  const visibleLocalRect = {
    height: surface.rect.height,
    width: surface.rect.width,
    x: surface.sourceClipOffset.x,
    y: surface.sourceClipOffset.y,
  };
  const clippedLocalRect = intersectGpuRetainedContentRects(
    rowVisualRect,
    visibleLocalRect,
  );
  if (clippedLocalRect.width <= 0 || clippedLocalRect.height <= 0) {
    return null;
  }
  return {
    color: toGpuRetainedContentRowHoverHtmlSurfaceColor(
      palette.rowHoverBackground,
    ),
    kind: "solid-rounded-rect",
    radius: 0,
    rect: {
      height: clippedLocalRect.height,
      width: clippedLocalRect.width,
      x: surface.rect.x - surface.sourceClipOffset.x + clippedLocalRect.x,
      y: surface.rect.y - surface.sourceClipOffset.y + clippedLocalRect.y,
    },
    surfaceId: `${surface.id}:row-hover:${rowId}`,
    zIndex: surface.zIndex,
  };
}

function resolveGpuRetainedContentRowHoverVisualRect({
  rowId,
  scrollOffset,
  surface,
}: {
  readonly rowId: string;
  readonly scrollOffset: GpuPoint;
  readonly surface: GpuRetainedContentSourceSurface;
}): GpuRect | null {
  const sourceInput = getGpuRetainedContentSceneSourceInput(
    surface.retainedScene,
  );
  const rowMetric = sourceInput?.layout.rowMetrics.find(
    (metric) => metric.input.id === rowId,
  );
  if (sourceInput && rowMetric) {
    return {
      height: rowMetric.height,
      width: sourceInput.rowVisualBounds.width,
      x:
        sourceInput.viewportRect.x +
        sourceInput.rowVisualBounds.x -
        scrollOffset.x,
      y: sourceInput.viewportRect.y + rowMetric.y - scrollOffset.y,
    };
  }
  return (
    surface.retainedScene.rows.find((candidate) => candidate.id === rowId)
      ?.visualProjectedRect ?? null
  );
}

export function areGpuRetainedContentRowHoverTargetsEqual(
  left: GpuRetainedContentRowHoverTarget | null,
  right: GpuRetainedContentRowHoverTarget | null,
): boolean {
  return left?.rowId === right?.rowId && left?.surfaceId === right?.surfaceId;
}

function toGpuRetainedContentRowHoverHtmlSurfaceColor(
  color: string,
): HtmlSurfaceColor {
  const parsedColor =
    parseHexGpuRetainedContentRowHoverColor(color) ??
    parseRgbaGpuRetainedContentRowHoverColor(color);
  if (!parsedColor) {
    throw new Error(`Unsupported retained row hover color "${color}".`);
  }
  return parsedColor;
}

function parseHexGpuRetainedContentRowHoverColor(
  color: string,
): HtmlSurfaceColor | null {
  const hex =
    /^#(?<red>[0-9a-f]{2})(?<green>[0-9a-f]{2})(?<blue>[0-9a-f]{2})$/iu.exec(
      color.trim(),
    );
  if (!hex?.groups) {
    return null;
  }
  const { blue, green, red } = hex.groups;
  if (!blue || !green || !red) {
    return null;
  }
  return {
    a: 1,
    b: Number.parseInt(blue, 16) / 255,
    g: Number.parseInt(green, 16) / 255,
    r: Number.parseInt(red, 16) / 255,
  };
}

function parseRgbaGpuRetainedContentRowHoverColor(
  color: string,
): HtmlSurfaceColor | null {
  const rgba =
    /^rgba\(\s*(?<red>\d+(?:\.\d+)?)\s*,\s*(?<green>\d+(?:\.\d+)?)\s*,\s*(?<blue>\d+(?:\.\d+)?)\s*,\s*(?<alpha>\d+(?:\.\d+)?)\s*\)$/iu.exec(
      color.trim(),
    );
  if (!rgba?.groups) {
    return null;
  }
  const { alpha, blue, green, red } = rgba.groups;
  if (!alpha || !blue || !green || !red) {
    return null;
  }
  return {
    a: Number(alpha),
    b: Number(blue) / 255,
    g: Number(green) / 255,
    r: Number(red) / 255,
  };
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
  return {
    height,
    width,
    x,
    y,
  };
}

function isGpuRetainedContentRowHoverDarkMode(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return Boolean(
    document.documentElement.closest(".dark") ??
      document.body?.closest(".dark"),
  );
}
