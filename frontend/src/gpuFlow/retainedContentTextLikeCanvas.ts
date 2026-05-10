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

const TEXT_LIKE_VALUE_FONT =
  '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const TEXT_LIKE_ROW_TEXT_OFFSET_Y = 3;
const TEXT_LIKE_PREVIEW_ELLIPSIS = "\u2026";
const TEXT_LIKE_PREVIEW_LINE_HEIGHT = 14;
const TEXT_LIKE_PREVIEW_BASELINE_OFFSET_Y = 11;

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
  ctx.font = TEXT_LIKE_VALUE_FONT;
  ctx.textAlign = "start";
  ctx.fillStyle = getTextLikeControlTextColor({
    disabled,
    palette,
  });
  const textLayout = getTextLikeControlTextLayout({ outer, palette, rect });
  if (state?.nativeControlActive) {
    return;
  }
  const text = getTextLikeControlText(control);
  if (control.editorKind === "text") {
    drawSingleLineTextLikePreview({
      ctx,
      layout: textLayout,
      text,
    });
    return;
  }
  drawWrappedTextLikePreview({
    ctx,
    layout: textLayout,
    text,
  });
}

function getTextLikeControlTextColor({
  disabled,
  palette,
}: {
  readonly disabled: boolean;
  readonly palette: GpuRetainedContentCanvasPalette;
}): string {
  if (disabled) {
    return palette.textLikeDisabledText;
  }
  return palette.textLikeText;
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

function getTextLikeControlTextLayout({
  outer,
  palette,
  rect,
}: {
  readonly outer: GpuRect;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
}): {
  readonly clipRect: GpuRect;
  readonly maxWidth: number;
  readonly singleLineY: number;
  readonly x: number;
} {
  if (palette.textLikeVisualStyle === "row-text") {
    const maxWidth = Math.max(
      0,
      rect.width - GPU_RETAINED_CONTENT_ROW_TEXT_VALUE_INSET_LEFT * 2,
    );
    const x = rect.x + GPU_RETAINED_CONTENT_ROW_TEXT_VALUE_INSET_LEFT;
    return {
      clipRect: {
        height: rect.height,
        width: maxWidth,
        x,
        y: rect.y,
      },
      maxWidth,
      singleLineY: outer.y + outer.height / 2 + TEXT_LIKE_ROW_TEXT_OFFSET_Y,
      x,
    };
  }
  const maxWidth = Math.max(0, outer.width - 14);
  const x = outer.x + 7;
  return {
    clipRect: {
      height: outer.height,
      width: maxWidth,
      x,
      y: outer.y,
    },
    maxWidth,
    singleLineY: outer.y + outer.height / 2,
    x,
  };
}

function getTextLikeControlText(
  control: Extract<GpuRetainedContentControlDescriptor, { kind: "text-like" }>,
): string {
  return control.displayValue.trim().length > 0
    ? control.displayValue
    : control.defaultDisplayValue;
}

function drawSingleLineTextLikePreview({
  ctx,
  layout,
  text,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly layout: ReturnType<typeof getTextLikeControlTextLayout>;
  readonly text: string;
}) {
  if (layout.maxWidth <= 0) {
    return;
  }
  ctx.textBaseline = "middle";
  ctx.fillText(
    truncateTextLikePreviewLine(
      ctx,
      normalizeTextLikeSingleLinePreview(text),
      layout.maxWidth,
    ),
    layout.x,
    layout.singleLineY,
  );
}

function drawWrappedTextLikePreview({
  ctx,
  layout,
  text,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly layout: ReturnType<typeof getTextLikeControlTextLayout>;
  readonly text: string;
}) {
  if (layout.maxWidth <= 0 || layout.clipRect.height <= 0) {
    return;
  }
  const maxVisibleLines = Math.max(
    0,
    Math.floor(layout.clipRect.height / TEXT_LIKE_PREVIEW_LINE_HEIGHT),
  );
  if (maxVisibleLines <= 0) {
    return;
  }
  const wrappedLines = createWrappedTextLikePreviewLines({
    ctx,
    maxLineCount: maxVisibleLines + 1,
    maxWidth: layout.maxWidth,
    text,
  });
  const visibleLines = wrappedLines.slice(0, maxVisibleLines);
  if (visibleLines.length === 0) {
    return;
  }
  if (wrappedLines.length > maxVisibleLines) {
    visibleLines[visibleLines.length - 1] = ellipsizeTextLikePreviewLine(
      ctx,
      visibleLines[visibleLines.length - 1] ?? "",
      layout.maxWidth,
    );
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(
    layout.clipRect.x,
    layout.clipRect.y,
    layout.clipRect.width,
    layout.clipRect.height,
  );
  ctx.clip();
  ctx.textBaseline = "alphabetic";
  const contentHeight = visibleLines.length * TEXT_LIKE_PREVIEW_LINE_HEIGHT;
  const firstBaselineY =
    layout.clipRect.y +
    Math.max(0, (layout.clipRect.height - contentHeight) / 2) +
    TEXT_LIKE_PREVIEW_BASELINE_OFFSET_Y;
  for (const [index, line] of visibleLines.entries()) {
    ctx.fillText(
      line,
      layout.x,
      firstBaselineY + index * TEXT_LIKE_PREVIEW_LINE_HEIGHT,
    );
  }
  ctx.restore();
}

function createWrappedTextLikePreviewLines({
  ctx,
  maxLineCount,
  maxWidth,
  text,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly maxLineCount: number;
  readonly maxWidth: number;
  readonly text: string;
}): string[] {
  if (maxLineCount <= 0 || maxWidth <= 0) {
    return [];
  }
  const lines: string[] = [];
  const paragraphs = normalizeTextLikePreviewNewlines(text).split("\n");
  for (const paragraph of paragraphs) {
    for (const line of wrapTextLikePreviewParagraph({
      ctx,
      maxLineCount: maxLineCount - lines.length,
      maxWidth,
      text: paragraph,
    })) {
      lines.push(line);
      if (lines.length >= maxLineCount) {
        return lines;
      }
    }
  }
  return lines;
}

function wrapTextLikePreviewParagraph({
  ctx,
  maxLineCount,
  maxWidth,
  text,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly maxLineCount: number;
  readonly maxWidth: number;
  readonly text: string;
}): string[] {
  if (maxLineCount <= 0) {
    return [];
  }
  if (text.length === 0) {
    return [""];
  }
  const state: TextLikePreviewWrapState = {
    currentLine: "",
    lines: [],
    maxLineCount,
  };
  for (const token of text.match(/\s+|\S+/g) ?? []) {
    appendTextLikePreviewWrapToken({
      ctx,
      maxWidth,
      state,
      token,
    });
    if (state.lines.length >= maxLineCount) {
      return state.lines;
    }
  }
  state.lines.push(state.currentLine.trimEnd());
  return state.lines;
}

type TextLikePreviewWrapState = {
  currentLine: string;
  readonly lines: string[];
  readonly maxLineCount: number;
};

function appendTextLikePreviewWrapToken({
  ctx,
  maxWidth,
  state,
  token,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly maxWidth: number;
  readonly state: TextLikePreviewWrapState;
  readonly token: string;
}) {
  const candidate = state.currentLine + token;
  if (
    state.currentLine.length === 0 ||
    ctx.measureText(candidate).width <= maxWidth
  ) {
    state.currentLine = candidate;
  } else {
    state.lines.push(state.currentLine.trimEnd());
    state.currentLine = token.trimStart();
  }
  splitOverflowingTextLikePreviewLine({
    ctx,
    maxWidth,
    state,
  });
}

function splitOverflowingTextLikePreviewLine({
  ctx,
  maxWidth,
  state,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly maxWidth: number;
  readonly state: TextLikePreviewWrapState;
}) {
  while (
    state.lines.length < state.maxLineCount &&
    state.currentLine.length > 0 &&
    ctx.measureText(state.currentLine).width > maxWidth
  ) {
    const split = splitTextLikePreviewMeasuredPrefix(
      ctx,
      state.currentLine,
      maxWidth,
    );
    state.lines.push(split.prefix.trimEnd());
    state.currentLine = split.remainder.trimStart();
  }
}

function splitTextLikePreviewMeasuredPrefix(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): {
  readonly prefix: string;
  readonly remainder: string;
} {
  const characters = Array.from(text);
  let lower = 1;
  let upper = characters.length;
  while (lower < upper) {
    const nextLength = Math.ceil((lower + upper) / 2);
    const candidate = characters.slice(0, nextLength).join("");
    if (ctx.measureText(candidate).width <= maxWidth) {
      lower = nextLength;
    } else {
      upper = nextLength - 1;
    }
  }
  return {
    prefix: characters.slice(0, lower).join(""),
    remainder: characters.slice(lower).join(""),
  };
}

function truncateTextLikePreviewLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (text.length === 0 || ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  return ellipsizeTextLikePreviewLine(ctx, text, maxWidth);
}

function ellipsizeTextLikePreviewLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) {
    return "";
  }
  const ellipsisWidth = ctx.measureText(TEXT_LIKE_PREVIEW_ELLIPSIS).width;
  if (ellipsisWidth > maxWidth) {
    return "";
  }
  if (text.length === 0) {
    return TEXT_LIKE_PREVIEW_ELLIPSIS;
  }
  const characters = Array.from(text);
  let lower = 0;
  let upper = characters.length;
  while (lower < upper) {
    const nextLength = Math.ceil((lower + upper) / 2);
    const candidate =
      characters.slice(0, nextLength).join("") + TEXT_LIKE_PREVIEW_ELLIPSIS;
    if (ctx.measureText(candidate).width <= maxWidth) {
      lower = nextLength;
    } else {
      upper = nextLength - 1;
    }
  }
  return characters.slice(0, lower).join("") + TEXT_LIKE_PREVIEW_ELLIPSIS;
}

function normalizeTextLikeSingleLinePreview(text: string): string {
  return normalizeTextLikePreviewNewlines(text).replace(/\n/g, " ");
}

function normalizeTextLikePreviewNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function insetRect(rect: GpuRect, insetX: number, insetY: number): GpuRect {
  return {
    height: Math.max(0, rect.height - insetY * 2),
    width: Math.max(0, rect.width - insetX * 2),
    x: rect.x + insetX,
    y: rect.y + insetY,
  };
}
