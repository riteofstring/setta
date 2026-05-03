import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import type { GpuRetainedContentRowState } from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

const RETAINED_CONTENT_ROW_FONT =
  "12px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export function drawGpuRetainedContentRowBackground({
  ctx,
  palette,
  rect,
  state,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState;
}) {
  ctx.fillStyle = getGpuRetainedContentRowBackgroundColor(state, palette);
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = palette.rowDivider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rect.x, rect.y + rect.height - 0.5);
  ctx.lineTo(rect.x + rect.width, rect.y + rect.height - 0.5);
  ctx.stroke();
  if (state.focused) {
    ctx.strokeStyle = palette.focusRing;
    ctx.lineWidth = 1;
    strokeInsetRect(ctx, rect, 0.5);
  }
  if (state.searchMatched) {
    ctx.strokeStyle = palette.searchRing;
    ctx.lineWidth = 2;
    strokeInsetRect(ctx, rect, 1);
  }
  if (state.searchFocused) {
    ctx.strokeStyle = palette.searchFocusedRing;
    ctx.lineWidth = 2;
    strokeInsetRect(ctx, rect, 1);
  }
  if (state.error) {
    ctx.fillStyle = palette.errorAccent;
    ctx.fillRect(rect.x, rect.y, 3, rect.height);
  }
}

export function drawGpuRetainedContentNestGuide(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  palette: GpuRetainedContentCanvasPalette,
) {
  ctx.fillStyle = palette.nestGuide;
  ctx.fillRect(rect.x, rect.y + 4, rect.width, Math.max(0, rect.height - 8));
}

export function drawGpuRetainedContentLabel({
  ctx,
  palette,
  rect,
  state,
  text,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
  readonly text: string;
}) {
  ctx.font = RETAINED_CONTENT_ROW_FONT;
  ctx.textBaseline = "middle";
  ctx.fillStyle = state?.disabled ? palette.disabledText : palette.labelText;
  const paddingX = 8;
  ctx.fillText(
    text,
    rect.x + paddingX,
    rect.y + rect.height / 2,
    Math.max(0, rect.width - paddingX * 2),
  );
}

function getGpuRetainedContentRowBackgroundColor(
  state: GpuRetainedContentRowState,
  palette: GpuRetainedContentCanvasPalette,
): string {
  if (state.error) {
    return palette.rowErrorBackground;
  }
  if (state.dragging) {
    return palette.rowDraggingBackground;
  }
  if (state.selected) {
    return palette.rowSelectedBackground;
  }
  if (state.focused) {
    return palette.rowFocusedBackground;
  }
  if (state.hovered) {
    return palette.rowHoverBackground;
  }
  return palette.rowBackground;
}

function strokeInsetRect(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  inset: number,
) {
  ctx.strokeRect(
    rect.x + inset,
    rect.y + inset,
    Math.max(0, rect.width - inset * 2),
    Math.max(0, rect.height - inset * 2),
  );
}
