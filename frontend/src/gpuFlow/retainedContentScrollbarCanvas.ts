import { fillRoundRect } from "./retainedContentCanvasDrawing";
import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import type { GpuRetainedContentDrawCommand } from "./retainedContentScene";

type GpuRetainedContentScrollbarCommand = Extract<
  GpuRetainedContentDrawCommand,
  { kind: "scrollbar" }
>;

export function drawGpuRetainedContentScrollbar({
  command,
  ctx,
  palette,
}: {
  readonly command: GpuRetainedContentScrollbarCommand;
  readonly ctx: CanvasRenderingContext2D;
  readonly palette: GpuRetainedContentCanvasPalette;
}) {
  const trackRadius =
    command.axis === "y"
      ? command.trackRect.width / 2
      : command.trackRect.height / 2;
  const thumbRadius =
    command.axis === "y"
      ? command.thumbRect.width / 2
      : command.thumbRect.height / 2;
  const trackActive = command.state?.activePart === "track";
  const trackHovered = command.state?.hoveredPart === "track";
  const thumbActive = command.state?.activePart === "thumb";
  const thumbHovered = command.state?.hoveredPart === "thumb";

  ctx.save();
  ctx.globalAlpha = trackActive ? 1 : trackHovered ? 0.94 : 0.86;
  ctx.fillStyle = getGpuRetainedContentScrollbarTrackFill({
    active: trackActive,
    hovered: trackHovered,
    palette,
  });
  fillRoundRect(ctx, command.trackRect, trackRadius);
  ctx.globalAlpha = 1;
  ctx.fillStyle = getGpuRetainedContentScrollbarThumbFill({
    active: thumbActive,
    hovered: thumbHovered,
    palette,
  });
  fillRoundRect(ctx, command.thumbRect, thumbRadius);
  ctx.restore();
}

function getGpuRetainedContentScrollbarTrackFill({
  active,
  hovered,
  palette,
}: {
  readonly active: boolean;
  readonly hovered: boolean;
  readonly palette: GpuRetainedContentCanvasPalette;
}): string {
  if (palette.textLikeVisualStyle === "row-text") {
    if (active) {
      return "rgba(148, 163, 184, 0.34)";
    }
    return hovered ? "rgba(148, 163, 184, 0.26)" : "rgba(148, 163, 184, 0.18)";
  }
  if (active) {
    return "rgba(15, 23, 42, 0.18)";
  }
  return hovered ? "rgba(15, 23, 42, 0.13)" : "rgba(15, 23, 42, 0.08)";
}

function getGpuRetainedContentScrollbarThumbFill({
  active,
  hovered,
  palette,
}: {
  readonly active: boolean;
  readonly hovered: boolean;
  readonly palette: GpuRetainedContentCanvasPalette;
}): string {
  if (palette.textLikeVisualStyle === "row-text") {
    if (active) {
      return "rgba(203, 213, 225, 0.86)";
    }
    return hovered ? "rgba(203, 213, 225, 0.74)" : "rgba(148, 163, 184, 0.62)";
  }
  if (active) {
    return "rgba(51, 65, 85, 0.78)";
  }
  return hovered ? "rgba(51, 65, 85, 0.62)" : "rgba(71, 85, 105, 0.46)";
}
