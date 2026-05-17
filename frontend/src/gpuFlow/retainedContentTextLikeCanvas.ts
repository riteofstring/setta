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
  const outer =
    palette.textLikeVisualStyle === "row-text" ? rect : insetRect(rect, 6, 5);
  if (palette.textLikeVisualStyle === "row-text") {
    drawTextLikeActiveUnderline(ctx, outer, palette, state);
    drawTextLikeValue({ control, ctx, outer, palette, state });
    return;
  }
  ctx.fillStyle = disabled
    ? palette.textLikeDisabledBackground
    : palette.textLikeBackground;
  ctx.strokeStyle = getTextLikeControlStrokeColor(state, palette);
  ctx.lineWidth = 1;
  fillRoundRect(ctx, outer, 4);
  strokeRoundRect(ctx, outer, 4);
  drawTextLikeValue({ control, ctx, outer, palette, state });
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

function drawTextLikeValue({
  control,
  ctx,
  outer,
  palette,
  state,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "text-like" }
  >;
  readonly ctx: CanvasRenderingContext2D;
  readonly outer: GpuRect;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  if (shouldSkipTextLikeValue(control, state, outer)) {
    return;
  }
  const textRect = resolveTextLikeTextRect(outer, palette);
  if (textRect.width <= 0 || textRect.height <= 0) {
    return;
  }
  const textContent = resolveTextLikeValueText(control);
  if (!textContent) {
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(textRect.x, textRect.y, textRect.width, textRect.height);
  ctx.clip();
  ctx.font = resolveTextLikeCanvasFont(control);
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillStyle = resolveTextLikeValueColor({
    palette,
    placeholder: textContent.placeholder,
    state,
  });

  const lineHeight = 15;
  const lines = createTextLikeCanvasLines({
    maxLines: resolveTextLikeCanvasMaxLines({
      control,
      textRect,
      lineHeight,
    }),
    text: textContent.text,
  });
  const firstBaseline =
    control.policy.linePolicy === "single-line" || lines.length <= 1
      ? textRect.y +
        textRect.height / 2 +
        (palette.textLikeVisualStyle === "row-text" ? 2 : 0)
      : textRect.y + lineHeight / 2;
  lines.forEach((line, index) => {
    ctx.fillText(
      line,
      textRect.x,
      firstBaseline + index * lineHeight,
      textRect.width,
    );
  });
  ctx.restore();
}

function shouldSkipTextLikeValue(
  control: Extract<GpuRetainedContentControlDescriptor, { kind: "text-like" }>,
  state: GpuRetainedContentRowState | undefined,
  outer: GpuRect,
): boolean {
  return Boolean(
    control.renderOwner === "dom-owned" ||
      state?.nativeControlActive ||
      outer.width <= 0 ||
      outer.height <= 0,
  );
}

function resolveTextLikeTextRect(
  outer: GpuRect,
  palette: GpuRetainedContentCanvasPalette,
): GpuRect {
  const paddingX = palette.textLikeVisualStyle === "row-text" ? 0 : 7;
  const paddingY = palette.textLikeVisualStyle === "row-text" ? 2 : 0;
  return {
    height: Math.max(0, outer.height - paddingY * 2),
    width: Math.max(0, outer.width - paddingX * 2),
    x: outer.x + paddingX,
    y: outer.y + paddingY,
  };
}

function resolveTextLikeValueText(
  control: Extract<GpuRetainedContentControlDescriptor, { kind: "text-like" }>,
): { readonly placeholder: boolean; readonly text: string } | null {
  const placeholder = control.displayValue.length === 0;
  const text = placeholder ? control.defaultDisplayValue : control.displayValue;
  return text.length > 0 ? { placeholder, text } : null;
}

function resolveTextLikeCanvasFont(
  control: Extract<GpuRetainedContentControlDescriptor, { kind: "text-like" }>,
): string {
  return control.editorKind === "code"
    ? "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    : "11px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
}

function resolveTextLikeValueColor({
  palette,
  placeholder,
  state,
}: {
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly placeholder: boolean;
  readonly state: GpuRetainedContentRowState | undefined;
}): string {
  if (state?.disabled) {
    return palette.textLikeDisabledText;
  }
  if (state?.error) {
    return palette.errorAccent;
  }
  return placeholder ? palette.labelMutedText : palette.textLikeText;
}

function resolveTextLikeCanvasMaxLines({
  control,
  lineHeight,
  textRect,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "text-like" }
  >;
  readonly lineHeight: number;
  readonly textRect: GpuRect;
}): number {
  if (control.policy.linePolicy === "single-line") {
    return 1;
  }
  return Math.max(
    1,
    Math.min(
      control.policy.maxVisibleLines,
      Math.floor(textRect.height / lineHeight),
    ),
  );
}

function createTextLikeCanvasLines({
  maxLines,
  text,
}: {
  readonly maxLines: number;
  readonly text: string;
}): readonly string[] {
  const normalizedLines = text.replace(/\r\n?/g, "\n").split("\n");
  if (normalizedLines.length <= maxLines) {
    return normalizedLines;
  }
  return normalizedLines.slice(0, maxLines);
}

function insetRect(rect: GpuRect, insetX: number, insetY: number): GpuRect {
  return {
    height: Math.max(0, rect.height - insetY * 2),
    width: Math.max(0, rect.width - insetX * 2),
    x: rect.x + insetX,
    y: rect.y + insetY,
  };
}
