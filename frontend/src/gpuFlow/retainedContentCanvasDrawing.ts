import type { GpuRect } from "./viewportMath";

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  radius: number,
) {
  createRoundRectPath(ctx, rect, radius);
  ctx.fill();
}

export function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  radius: number,
) {
  createRoundRectPath(ctx, rect, radius);
  ctx.stroke();
}

function createRoundRectPath(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  radius: number,
) {
  const resolvedRadius = Math.max(
    0,
    Math.min(radius, rect.width / 2, rect.height / 2),
  );
  ctx.beginPath();
  ctx.moveTo(rect.x + resolvedRadius, rect.y);
  ctx.lineTo(rect.x + rect.width - resolvedRadius, rect.y);
  ctx.quadraticCurveTo(
    rect.x + rect.width,
    rect.y,
    rect.x + rect.width,
    rect.y + resolvedRadius,
  );
  ctx.lineTo(rect.x + rect.width, rect.y + rect.height - resolvedRadius);
  ctx.quadraticCurveTo(
    rect.x + rect.width,
    rect.y + rect.height,
    rect.x + rect.width - resolvedRadius,
    rect.y + rect.height,
  );
  ctx.lineTo(rect.x + resolvedRadius, rect.y + rect.height);
  ctx.quadraticCurveTo(
    rect.x,
    rect.y + rect.height,
    rect.x,
    rect.y + rect.height - resolvedRadius,
  );
  ctx.lineTo(rect.x, rect.y + resolvedRadius);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + resolvedRadius, rect.y);
  ctx.closePath();
}
