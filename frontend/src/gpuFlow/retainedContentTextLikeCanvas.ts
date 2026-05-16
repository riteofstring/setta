import { fillRoundRect, strokeRoundRect } from "./retainedContentCanvasDrawing";
import {
  getGpuRetainedContentCanvasPalette,
  type GpuRetainedContentCanvasPalette,
} from "./retainedContentCanvasTheme";
import { GPU_RETAINED_CONTENT_ROW_TEXT_VALUE_INSET_LEFT } from "./retainedContentRowLayout";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

const RETAINED_CONTENT_TEXT_LIKE_BOX_VALUE_FONT =
  "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const RETAINED_CONTENT_TEXT_LIKE_BOX_LINE_HEIGHT = 14;
const RETAINED_CONTENT_TEXT_LIKE_ROW_VALUE_FONT =
  "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const RETAINED_CONTENT_TEXT_LIKE_ROW_LINE_HEIGHT = 16;

type TextLikeValueStyle = {
  readonly font: string;
  readonly lineHeight: number;
};

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
    drawTextLikeValue({
      control,
      ctx,
      disabled,
      palette,
      rect: createRowTextValueRect(rect),
      style: {
        font: RETAINED_CONTENT_TEXT_LIKE_ROW_VALUE_FONT,
        lineHeight: RETAINED_CONTENT_TEXT_LIKE_ROW_LINE_HEIGHT,
      },
    });
    return;
  }
  ctx.fillStyle = disabled
    ? palette.textLikeDisabledBackground
    : palette.textLikeBackground;
  ctx.strokeStyle = getTextLikeControlStrokeColor(state, palette);
  ctx.lineWidth = 1;
  fillRoundRect(ctx, outer, 4);
  strokeRoundRect(ctx, outer, 4);
  drawTextLikeValue({
    control,
    ctx,
    disabled,
    palette,
    rect: insetRect(outer, 6, 0),
    style: {
      font: RETAINED_CONTENT_TEXT_LIKE_BOX_VALUE_FONT,
      lineHeight: RETAINED_CONTENT_TEXT_LIKE_BOX_LINE_HEIGHT,
    },
  });
}

function drawTextLikeValue({
  control,
  ctx,
  disabled,
  palette,
  rect,
  style,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "text-like" }
  >;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
  readonly style: TextLikeValueStyle;
}) {
  const lines = resolveTextLikeValueLines(control);
  if (rect.width <= 0 || rect.height <= 0 || lines.length === 0) {
    return;
  }
  const maxLines = Math.max(
    1,
    Math.min(
      lines.length,
      control.policy.linePolicy === "single-line"
        ? 1
        : control.policy.maxVisibleLines,
      Math.floor(rect.height / style.lineHeight),
    ),
  );
  const firstLineCenter =
    maxLines === 1
      ? rect.y + rect.height / 2
      : rect.y +
        Math.max(
          style.lineHeight / 2,
          (rect.height - maxLines * style.lineHeight) / 2 +
            style.lineHeight / 2,
        );
  ctx.font = style.font;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = disabled
    ? palette.textLikeDisabledText
    : palette.textLikeText;
  for (let index = 0; index < maxLines; index += 1) {
    const line = lines[index] ?? "";
    const lineCenter = firstLineCenter + index * style.lineHeight;
    ctx.fillText(
      line,
      rect.x,
      resolveAlphabeticBaselineForCenteredText(ctx, line, lineCenter),
      Math.max(0, rect.width),
    );
  }
}

function resolveAlphabeticBaselineForCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerY: number,
): number {
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;
  if (Number.isFinite(ascent) && Number.isFinite(descent)) {
    return centerY - (descent - ascent) / 2;
  }
  return centerY;
}

function resolveTextLikeValueLines(
  control: Extract<GpuRetainedContentControlDescriptor, { kind: "text-like" }>,
): readonly string[] {
  const value =
    control.displayValue.length > 0
      ? control.displayValue
      : control.defaultDisplayValue;
  if (value.length === 0) {
    return [" "];
  }
  return value.split(/\r?\n/);
}

function createRowTextValueRect(rect: GpuRect): GpuRect {
  const insetLeft = GPU_RETAINED_CONTENT_ROW_TEXT_VALUE_INSET_LEFT;
  return {
    height: rect.height,
    width: Math.max(0, rect.width - insetLeft),
    x: rect.x + insetLeft,
    y: rect.y,
  };
}

function drawTextLikeActiveUnderline(
  ctx: CanvasRenderingContext2D,
  outer: GpuRect,
  palette: GpuRetainedContentCanvasPalette,
  state: GpuRetainedContentRowState | undefined,
) {
  if (!isTextLikeControlFocused(state) && !state?.selected) {
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
  if (isTextLikeControlFocused(state)) {
    return palette.textLikeFocusedBorder;
  }
  if (state?.selected) {
    return palette.textLikeSelectedBorder;
  }
  return palette.textLikeBorder;
}

function isTextLikeControlFocused(
  state: GpuRetainedContentRowState | undefined,
): boolean {
  return Boolean(state?.focused || state?.controlFocused);
}

function insetRect(rect: GpuRect, insetX: number, insetY: number): GpuRect {
  return {
    height: Math.max(0, rect.height - insetY * 2),
    width: Math.max(0, rect.width - insetX * 2),
    x: rect.x + insetX,
    y: rect.y + insetY,
  };
}
