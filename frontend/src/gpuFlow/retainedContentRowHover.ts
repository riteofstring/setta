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
import type { GpuFlowScene } from "./scene";
import type { GpuRect } from "./viewportMath";

export type GpuRetainedContentRowHoverTarget = {
  readonly rowId: string;
  readonly surfaceId: string;
};

export function getGpuRetainedContentRowHoverVisuals({
  scene,
  target,
}: {
  readonly scene: GpuFlowScene | undefined;
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
  )) {
    if (surface.id !== target.surfaceId) {
      continue;
    }
    const visual = createGpuRetainedContentRowHoverVisual({
      palette,
      rowId: target.rowId,
      surface,
    });
    if (visual) {
      visuals.push(visual);
    }
  }
  return visuals;
}

function createGpuRetainedContentRowHoverVisual({
  palette,
  rowId,
  surface,
}: {
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rowId: string;
  readonly surface: GpuRetainedContentSourceSurface;
}): HtmlSurfaceSolidRoundedRectVisual | null {
  const row = surface.retainedScene.rows.find(
    (candidate) => candidate.id === rowId,
  );
  if (!row) {
    return null;
  }
  const visibleLocalRect = {
    height: surface.rect.height,
    width: surface.rect.width,
    x: surface.sourceClipOffset.x,
    y: surface.sourceClipOffset.y,
  };
  const clippedLocalRect = intersectGpuRetainedContentRects(
    row.visualProjectedRect,
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
    surfaceId: `${surface.id}:row-hover:${row.id}`,
    zIndex: surface.zIndex,
  };
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
  const hex = /^#(?<red>[0-9a-f]{2})(?<green>[0-9a-f]{2})(?<blue>[0-9a-f]{2})$/iu.exec(
    color.trim(),
  );
  if (hex?.groups) {
    return {
      a: 1,
      b: Number.parseInt(hex.groups.blue, 16) / 255,
      g: Number.parseInt(hex.groups.green, 16) / 255,
      r: Number.parseInt(hex.groups.red, 16) / 255,
    };
  }
  const rgba =
    /^rgba\(\s*(?<red>\d+(?:\.\d+)?)\s*,\s*(?<green>\d+(?:\.\d+)?)\s*,\s*(?<blue>\d+(?:\.\d+)?)\s*,\s*(?<alpha>\d+(?:\.\d+)?)\s*\)$/iu.exec(
      color.trim(),
    );
  if (rgba?.groups) {
    return {
      a: Number(rgba.groups.alpha),
      b: Number(rgba.groups.blue) / 255,
      g: Number(rgba.groups.green) / 255,
      r: Number(rgba.groups.red) / 255,
    };
  }
  throw new Error(`Unsupported retained row hover color "${color}".`);
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
