import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";

export type GpuRetainedContentScrollbarColor = {
  readonly a: number;
  readonly b: number;
  readonly g: number;
  readonly r: number;
};

export function getGpuRetainedContentScrollbarTrackColor({
  active,
  hovered,
  palette,
}: {
  readonly active: boolean;
  readonly hovered: boolean;
  readonly palette: GpuRetainedContentCanvasPalette;
}): GpuRetainedContentScrollbarColor {
  if (palette.textLikeVisualStyle === "row-text") {
    if (active) {
      return rgba(148, 163, 184, 0.34);
    }
    return hovered ? rgba(148, 163, 184, 0.26) : rgba(148, 163, 184, 0.18);
  }
  if (active) {
    return rgba(15, 23, 42, 0.18);
  }
  return hovered ? rgba(15, 23, 42, 0.13) : rgba(15, 23, 42, 0.08);
}

export function getGpuRetainedContentScrollbarThumbColor({
  active,
  hovered,
  palette,
}: {
  readonly active: boolean;
  readonly hovered: boolean;
  readonly palette: GpuRetainedContentCanvasPalette;
}): GpuRetainedContentScrollbarColor {
  if (palette.textLikeVisualStyle === "row-text") {
    if (active) {
      return rgba(203, 213, 225, 0.86);
    }
    return hovered ? rgba(203, 213, 225, 0.74) : rgba(148, 163, 184, 0.62);
  }
  if (active) {
    return rgba(51, 65, 85, 0.78);
  }
  return hovered ? rgba(51, 65, 85, 0.62) : rgba(71, 85, 105, 0.46);
}

function rgba(
  r: number,
  g: number,
  b: number,
  a: number,
): GpuRetainedContentScrollbarColor {
  return { a, b, g, r };
}
