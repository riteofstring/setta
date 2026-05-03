import { fillRoundRect, strokeRoundRect } from "./retainedContentCanvasDrawing";
import {
  getGpuRetainedContentCanvasPalette,
  type GpuRetainedContentCanvasPalette,
} from "./retainedContentCanvasTheme";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

const TEXT_LIKE_CONTROL_FONT =
  "10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const TEXT_LIKE_CODE_FONT =
  "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export function drawGpuRetainedContentTextLikeControl({
  control,
  ctx,
  palette = getGpuRetainedContentCanvasPalette(false),
  rect,
  state,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "text-like" }
  >;
  readonly ctx: CanvasRenderingContext2D;
  readonly palette?: GpuRetainedContentCanvasPalette | undefined;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const disabled = state?.disabled ?? false;
  const outer = insetRect(rect, 6, 5);
  if (palette.textLikeVisualStyle === "row-text") {
    drawTextLikeActiveUnderline(ctx, outer, palette, state);
  } else {
    ctx.fillStyle = disabled
      ? palette.textLikeDisabledBackground
      : palette.textLikeBackground;
    ctx.strokeStyle = getTextLikeControlStrokeColor(state, palette);
    ctx.lineWidth = 1;
    fillRoundRect(ctx, outer, 4);
    strokeRoundRect(ctx, outer, 4);
  }
  ctx.font = getTextLikeControlFont(control);
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillStyle = getTextLikeControlTextColor({
    control,
    disabled,
    palette,
  });
  ctx.fillText(
    getTextLikeControlText(control),
    outer.x + 7,
    outer.y + outer.height / 2,
    Math.max(0, outer.width - 14),
  );
}

function getTextLikeControlTextColor({
  control,
  disabled,
  palette,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "text-like" }
  >;
  readonly disabled: boolean;
  readonly palette: GpuRetainedContentCanvasPalette;
}): string {
  if (disabled) {
    return palette.textLikeDisabledText;
  }
  const tokenColor = getTextLikeCodeTokenColor({
    palette,
    text: getTextLikeControlText(control),
  });
  return tokenColor ?? palette.textLikeText;
}

function getTextLikeCodeTokenColor({
  palette,
  text,
}: {
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly text: string;
}): string | null {
  const trimmed = text.trim();
  if (trimmed === "true" || trimmed === "false" || trimmed === "null") {
    return palette.textLikeCodeAtomText;
  }
  if (isJsonNumberToken(trimmed)) {
    return palette.textLikeCodeNumberText;
  }
  return null;
}

function isJsonNumberToken(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(value);
}

function drawTextLikeActiveUnderline(
  ctx: CanvasRenderingContext2D,
  outer: GpuRect,
  palette: GpuRetainedContentCanvasPalette,
  state: GpuRetainedContentRowState | undefined,
) {
  if (!state?.focused && !state?.selected) {
    return;
  }
  ctx.strokeStyle = getTextLikeControlStrokeColor(state, palette);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(outer.x, outer.y + outer.height - 0.5);
  ctx.lineTo(outer.x + outer.width, outer.y + outer.height - 0.5);
  ctx.stroke();
  strokeRoundRect(ctx, outer, 4);
}

function getTextLikeControlStrokeColor(
  state: GpuRetainedContentRowState | undefined,
  palette: GpuRetainedContentCanvasPalette,
): string {
  if (state?.focused) {
    return palette.textLikeFocusedBorder;
  }
  if (state?.selected) {
    return palette.textLikeSelectedBorder;
  }
  return palette.textLikeBorder;
}

function getTextLikeControlFont(
  control: Extract<GpuRetainedContentControlDescriptor, { kind: "text-like" }>,
): string {
  return control.editorKind === "code"
    ? TEXT_LIKE_CODE_FONT
    : TEXT_LIKE_CONTROL_FONT;
}

function getTextLikeControlText(
  control: Extract<GpuRetainedContentControlDescriptor, { kind: "text-like" }>,
): string {
  return control.displayValue.trim().length > 0
    ? control.displayValue
    : control.defaultDisplayValue;
}

function insetRect(rect: GpuRect, insetX: number, insetY: number): GpuRect {
  return {
    height: Math.max(0, rect.height - insetY * 2),
    width: Math.max(0, rect.width - insetX * 2),
    x: rect.x + insetX,
    y: rect.y + insetY,
  };
}
