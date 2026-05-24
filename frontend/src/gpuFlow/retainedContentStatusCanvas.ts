import { fillRoundRect, strokeRoundRect } from "./retainedContentCanvasDrawing";
import type { GpuRetainedContentRowStatus } from "./retainedContentRowStatus";
import type { GpuRect } from "./viewportMath";

export function drawGpuRetainedContentStatusBadge({
  ctx,
  rect,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
}) {
  ctx.save();
  ctx.fillStyle = "#dc2626";
  fillRoundRect(ctx, rect, rect.height / 2);
  ctx.font = "bold 11px Inter, ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("!", rect.x + rect.width / 2, rect.y + rect.height / 2 + 0.5);
  ctx.restore();
}

export function drawGpuRetainedContentStatusOverlay({
  ctx,
  rect,
  status,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly status: GpuRetainedContentRowStatus;
}) {
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.16)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#fff1f2";
  fillRoundRect(ctx, rect, 6);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#fca5a5";
  ctx.lineWidth = 1;
  strokeRoundRect(ctx, rect, 6);
  ctx.font = "600 11px Inter, ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#991b1b";
  const paddingX = 10;
  let y = rect.y + 8;
  ctx.fillText(status.summary, rect.x + paddingX, y, rect.width - paddingX * 2);
  y += 16;
  ctx.font = "10px Inter, ui-sans-serif, system-ui, sans-serif";
  for (const message of getGpuRetainedContentStatusOverlayLines(status)) {
    ctx.fillText(message, rect.x + paddingX, y, rect.width - paddingX * 2);
    y += 13;
  }
  ctx.restore();
}

function getGpuRetainedContentStatusOverlayLines(
  status: GpuRetainedContentRowStatus,
): readonly string[] {
  if (status.messages.length <= 1) {
    return [];
  }
  return status.messages.slice(0, 4);
}
