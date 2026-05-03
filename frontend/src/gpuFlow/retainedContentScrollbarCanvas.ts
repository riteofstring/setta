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

  ctx.save();
  ctx.globalAlpha = 0.86;
  ctx.fillStyle =
    palette.textLikeVisualStyle === "row-text"
      ? "rgba(148, 163, 184, 0.18)"
      : "rgba(15, 23, 42, 0.08)";
  fillRoundRect(ctx, command.trackRect, trackRadius);
  ctx.globalAlpha = 1;
  ctx.fillStyle =
    palette.textLikeVisualStyle === "row-text"
      ? "rgba(148, 163, 184, 0.62)"
      : "rgba(71, 85, 105, 0.46)";
  fillRoundRect(ctx, command.thumbRect, thumbRadius);
  ctx.restore();
}
