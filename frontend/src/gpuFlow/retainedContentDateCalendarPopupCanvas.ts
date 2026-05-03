import type { GpuRetainedContentDateCalendarCell } from "./retainedContentDateCalendarTypes";
import type { GpuRect } from "./viewportMath";

const DATE_CALENDAR_HEADER_FONT =
  "600 12px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const DATE_CALENDAR_WEEKDAY_FONT =
  "600 10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const DATE_CALENDAR_CELL_FONT =
  "11px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const DATE_CALENDAR_SUMMARY_FONT =
  "10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export function drawGpuRetainedContentDateCalendarHeader({
  ctx,
  monthTitle,
  rect,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly monthTitle: string;
  readonly rect: GpuRect;
}) {
  ctx.font = DATE_CALENDAR_HEADER_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(
    monthTitle,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    rect.width,
  );
  ctx.textAlign = "start";
}

export function drawGpuRetainedContentDateCalendarNavigation({
  ctx,
  direction,
  rect,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly direction: -1 | 1;
  readonly rect: GpuRect;
}) {
  ctx.font = DATE_CALENDAR_HEADER_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#2563eb";
  ctx.fillText(
    direction === -1 ? "<" : ">",
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
  );
  ctx.textAlign = "start";
}

export function drawGpuRetainedContentDateCalendarWeekday({
  ctx,
  rect,
  text,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly text: string;
}) {
  ctx.font = DATE_CALENDAR_WEEKDAY_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#64748b";
  ctx.fillText(text, rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.textAlign = "start";
}

export function drawGpuRetainedContentDateCalendarCell({
  cell,
  ctx,
  rect,
}: {
  readonly cell: GpuRetainedContentDateCalendarCell;
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
}) {
  const cellRect = insetRect(rect, 2, 2);
  if (cell.selected) {
    ctx.fillStyle = "#2563eb";
    fillRoundRect(ctx, cellRect, 4);
  } else if (cell.today) {
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 1;
    strokeRoundRect(ctx, cellRect, 4);
  }
  ctx.font = DATE_CALENDAR_CELL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = getGpuRetainedContentDateCalendarCellTextColor(cell);
  ctx.fillText(
    String(cell.dayOfMonth),
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
  );
  ctx.textAlign = "start";
}

export function drawGpuRetainedContentDateCalendarSummary({
  ctx,
  rect,
  text,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly text: string;
}) {
  ctx.font = DATE_CALENDAR_SUMMARY_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#475569";
  ctx.fillText(text, rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.textAlign = "start";
}

function getGpuRetainedContentDateCalendarCellTextColor(
  cell: GpuRetainedContentDateCalendarCell,
): string {
  if (cell.selected) {
    return "#ffffff";
  }
  if (!cell.inCurrentMonth) {
    return "#94a3b8";
  }
  return "#1e293b";
}

function insetRect(rect: GpuRect, insetX: number, insetY: number): GpuRect {
  return {
    height: Math.max(0, rect.height - insetY * 2),
    width: Math.max(0, rect.width - insetX * 2),
    x: rect.x + insetX,
    y: rect.y + insetY,
  };
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  ctx.stroke();
}
