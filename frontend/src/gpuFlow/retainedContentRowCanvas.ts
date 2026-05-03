import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import type {
  GpuRetainedContentLabelAppearance,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

const RETAINED_CONTENT_ROW_SANS_FONT_FAMILY =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const RETAINED_CONTENT_ROW_MONO_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const RETAINED_CONTENT_ROW_TEXT_SIZE = "12px";
const RETAINED_CONTENT_ROW_LABEL_MONO_PADDING_X = 15;
const RETAINED_CONTENT_ROW_LABEL_SANS_PADDING_X = 16;
const RETAINED_CONTENT_ROW_LABEL_MONO_OFFSET_Y = 3;
const RETAINED_CONTENT_ROW_LABEL_SANS_OFFSET_Y = 2;
const RETAINED_CONTENT_ROW_LABEL_ELLIPSIS = "\u2026";

export function drawGpuRetainedContentRowBackground({
  ctx,
  dividerRects,
  palette,
  rect,
  state,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly dividerRects: readonly GpuRect[];
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState;
}) {
  ctx.fillStyle = getGpuRetainedContentRowBackgroundColor(state, palette);
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = palette.rowDivider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const dividerRect of dividerRects) {
    const y = dividerRect.y + dividerRect.height - 0.5;
    ctx.moveTo(dividerRect.x, y);
    ctx.lineTo(dividerRect.x + dividerRect.width, y);
  }
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
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

export function drawGpuRetainedContentLabel({
  appearance,
  ctx,
  palette,
  rect,
  state,
  text,
}: {
  readonly appearance: GpuRetainedContentLabelAppearance;
  readonly ctx: CanvasRenderingContext2D;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
  readonly text: string;
}) {
  ctx.font = getGpuRetainedContentLabelFont(appearance);
  ctx.textBaseline = "middle";
  ctx.fillStyle = getGpuRetainedContentLabelColor({
    appearance,
    palette,
    state,
  });
  const paddingX = getGpuRetainedContentLabelPaddingX(appearance);
  const maxWidth = Math.max(0, rect.width - paddingX * 2);
  ctx.fillText(
    truncateGpuRetainedContentLabelText(ctx, text, maxWidth),
    rect.x + paddingX,
    rect.y + rect.height / 2 + getGpuRetainedContentLabelOffsetY(appearance),
    maxWidth,
  );
}

function truncateGpuRetainedContentLabelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0 || text.length === 0) {
    return "";
  }
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  const ellipsisWidth = ctx.measureText(
    RETAINED_CONTENT_ROW_LABEL_ELLIPSIS,
  ).width;
  if (ellipsisWidth > maxWidth) {
    return "";
  }
  let lower = 0;
  let upper = text.length;
  while (lower < upper) {
    const nextLength = Math.ceil((lower + upper) / 2);
    const candidate =
      text.slice(0, nextLength) + RETAINED_CONTENT_ROW_LABEL_ELLIPSIS;
    if (ctx.measureText(candidate).width <= maxWidth) {
      lower = nextLength;
    } else {
      upper = nextLength - 1;
    }
  }
  return text.slice(0, lower) + RETAINED_CONTENT_ROW_LABEL_ELLIPSIS;
}

function getGpuRetainedContentLabelFont(
  appearance: GpuRetainedContentLabelAppearance,
): string {
  const fontWeight = appearance.fontWeight === "semibold" ? "600 " : "";
  const fontFamily =
    appearance.fontFamily === "mono"
      ? RETAINED_CONTENT_ROW_MONO_FONT_FAMILY
      : RETAINED_CONTENT_ROW_SANS_FONT_FAMILY;
  return `${fontWeight}${RETAINED_CONTENT_ROW_TEXT_SIZE} ${fontFamily}`;
}

function getGpuRetainedContentLabelOffsetY(
  appearance: GpuRetainedContentLabelAppearance,
): number {
  return appearance.fontFamily === "mono"
    ? RETAINED_CONTENT_ROW_LABEL_MONO_OFFSET_Y
    : RETAINED_CONTENT_ROW_LABEL_SANS_OFFSET_Y;
}

function getGpuRetainedContentLabelPaddingX(
  appearance: GpuRetainedContentLabelAppearance,
): number {
  return appearance.fontFamily === "mono"
    ? RETAINED_CONTENT_ROW_LABEL_MONO_PADDING_X
    : RETAINED_CONTENT_ROW_LABEL_SANS_PADDING_X;
}

function getGpuRetainedContentLabelColor({
  appearance,
  palette,
  state,
}: {
  readonly appearance: GpuRetainedContentLabelAppearance;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly state: GpuRetainedContentRowState | undefined;
}): string {
  if (state?.disabled) {
    return palette.disabledText;
  }
  if (appearance.tone === "accent") {
    return palette.labelAccentText;
  }
  if (appearance.tone === "muted") {
    return palette.labelMutedText;
  }
  return palette.labelText;
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
