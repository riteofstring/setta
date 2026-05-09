import { fillRoundRect } from "./retainedContentCanvasDrawing";
import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import type { GpuRetainedContentDrawCommand } from "./retainedContentScene";
import {
  formatGpuRetainedContentScrollbarCssColor,
  getGpuRetainedContentScrollbarThumbColor,
  getGpuRetainedContentScrollbarTrackColor,
} from "./retainedContentScrollbarColors";

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
  ctx.fillStyle = formatGpuRetainedContentScrollbarCssColor(
    getGpuRetainedContentScrollbarTrackColor({
      active: trackActive,
      hovered: trackHovered,
      palette,
    }),
  );
  fillRoundRect(ctx, command.trackRect, trackRadius);
  ctx.globalAlpha = 1;
  ctx.fillStyle = formatGpuRetainedContentScrollbarCssColor(
    getGpuRetainedContentScrollbarThumbColor({
      active: thumbActive,
      hovered: thumbHovered,
      palette,
    }),
  );
  fillRoundRect(ctx, command.thumbRect, thumbRadius);
  ctx.restore();
}
