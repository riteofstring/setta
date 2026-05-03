import {
  getGpuRetainedContentCanvasPalette,
  type GpuRetainedContentCanvasPalette,
} from "./retainedContentCanvasTheme";
import type {
  GpuRetainedContentColorChoice,
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentColorPickerControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "color-picker" }
>;

const RETAINED_CONTENT_CONTROL_FONT =
  "10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export function drawGpuRetainedContentColorPickerControl({
  control,
  ctx,
  palette = getGpuRetainedContentCanvasPalette(false),
  rect,
  state,
}: {
  readonly control: GpuRetainedContentColorPickerControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly palette?: GpuRetainedContentCanvasPalette | undefined;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const outer = getGpuRetainedContentColorPickerOuterRect(rect, palette);
  const disabled = state?.disabled ?? false;
  const selectedChoice = getGpuRetainedContentSelectedColorChoice(control);
  if (palette.textLikeVisualStyle === "row-text") {
    drawGpuRetainedContentColorPickerRowTextControl({
      control,
      ctx,
      disabled,
      outer,
      palette,
      selectedChoice,
      state,
    });
    return;
  }
  drawGpuRetainedContentColorPickerFrame({
    ctx,
    disabled,
    outer,
    palette,
    state,
  });
  const swatchRect = getGpuRetainedContentColorSwatchRect(outer);
  drawGpuRetainedContentColorSwatch({
    color: selectedChoice?.color ?? control.displayValue,
    ctx,
    disabled,
    rect: swatchRect,
  });
  drawGpuRetainedContentColorPickerLabel({
    control,
    ctx,
    outer,
    selectedChoice,
    swatchRect,
    disabled,
  });
  drawGpuRetainedContentColorPickerChevron({ ctx, disabled, outer });
}

export function drawGpuRetainedContentControlPopupBackground(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
) {
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.16)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#ffffff";
  fillRoundRect(ctx, rect, 6);
  ctx.restore();
  ctx.strokeStyle = "#bfdbfe";
  ctx.lineWidth = 1;
  strokeRoundRect(ctx, rect, 6);
}

export function drawGpuRetainedContentColorPickerPopupOption({
  ctx,
  highlighted,
  option,
  rect,
  selected,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly highlighted: boolean;
  readonly option: GpuRetainedContentColorChoice;
  readonly rect: GpuRect;
  readonly selected: boolean;
}) {
  if (selected || highlighted) {
    ctx.fillStyle = selected ? "#dbeafe" : "#eff6ff";
    fillRoundRect(ctx, rect, 4);
  }
  const swatchRect = getGpuRetainedContentColorPopupSwatchRect(rect);
  drawGpuRetainedContentColorSwatch({
    color: option.color,
    ctx,
    disabled: false,
    rect: swatchRect,
  });
  ctx.font = RETAINED_CONTENT_CONTROL_FONT;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(
    option.description || option.color,
    swatchRect.x + swatchRect.width + 7,
    rect.y + rect.height / 2,
    Math.max(0, rect.width - swatchRect.width - 18),
  );
}

function drawGpuRetainedContentColorPickerFrame({
  ctx,
  disabled,
  outer,
  palette,
  state,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  ctx.fillStyle =
    palette.textLikeVisualStyle === "row-text"
      ? "transparent"
      : disabled
        ? "#e2e8f0"
        : "#ffffff";
  ctx.strokeStyle =
    palette.textLikeVisualStyle === "row-text"
      ? state?.selected
        ? palette.textLikeSelectedBorder
        : palette.textLikeBorder
      : state?.selected
        ? "#2563eb"
        : "#cbd5e1";
  ctx.lineWidth = 1;
  fillRoundRect(ctx, outer, 5);
  strokeRoundRect(ctx, outer, 5);
}

function drawGpuRetainedContentColorPickerRowTextControl({
  control,
  ctx,
  disabled,
  outer,
  palette,
  selectedChoice,
  state,
}: {
  readonly control: GpuRetainedContentColorPickerControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly selectedChoice: GpuRetainedContentColorChoice | null;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const color = selectedChoice?.color ?? control.displayValue;
  ctx.fillStyle = disabled ? palette.textLikeDisabledBackground : color;
  fillRoundRect(ctx, outer, 5);
  ctx.strokeStyle = state?.selected
    ? palette.textLikeSelectedBorder
    : palette.textLikeBorder;
  ctx.lineWidth = 1;
  strokeRoundRect(ctx, outer, 5);

  const contrastColor = disabled
    ? palette.textLikeDisabledText
    : getGpuRetainedContentContrastTextColor(color, palette.textLikeText);
  if (control.choices.length === 0) {
    drawGpuRetainedContentNativeColorGlyph({
      ctx,
      outer,
      strokeStyle: contrastColor,
    });
    return;
  }
  drawGpuRetainedContentColorPickerRowTextLabel({
    control,
    ctx,
    outer,
    selectedChoice,
    textColor: contrastColor,
  });
  drawGpuRetainedContentColorPickerRowTextChevron({
    ctx,
    outer,
    strokeStyle: contrastColor,
  });
}

function drawGpuRetainedContentColorSwatch({
  color,
  ctx,
  disabled,
  rect,
}: {
  readonly color: string;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly rect: GpuRect;
}) {
  ctx.fillStyle = color;
  fillRoundRect(ctx, rect, 3);
  ctx.strokeStyle = disabled ? "#cbd5e1" : "#94a3b8";
  ctx.lineWidth = 1;
  strokeRoundRect(ctx, rect, 3);
}

function drawGpuRetainedContentColorPickerLabel({
  control,
  ctx,
  disabled,
  outer,
  selectedChoice,
  swatchRect,
}: {
  readonly control: GpuRetainedContentColorPickerControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
  readonly selectedChoice: GpuRetainedContentColorChoice | null;
  readonly swatchRect: GpuRect;
}) {
  const chevronWidth = 8;
  const labelX = swatchRect.x + swatchRect.width + 6;
  const labelMaxWidth = Math.max(
    0,
    outer.x + outer.width - chevronWidth - 8 - labelX,
  );
  ctx.font = RETAINED_CONTENT_CONTROL_FONT;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillStyle = disabled ? "#64748b" : "#334155";
  ctx.fillText(
    getGpuRetainedContentColorPickerLabel({ control, selectedChoice }),
    labelX,
    outer.y + outer.height / 2,
    labelMaxWidth,
  );
}

function drawGpuRetainedContentColorPickerRowTextLabel({
  control,
  ctx,
  outer,
  selectedChoice,
  textColor,
}: {
  readonly control: GpuRetainedContentColorPickerControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly outer: GpuRect;
  readonly selectedChoice: GpuRetainedContentColorChoice | null;
  readonly textColor: string;
}) {
  const label = getGpuRetainedContentColorPickerLabel({
    control,
    selectedChoice,
  });
  if (label.trim().length === 0) {
    return;
  }
  ctx.font = RETAINED_CONTENT_CONTROL_FONT;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillStyle = textColor;
  ctx.fillText(
    label,
    outer.x + 13,
    outer.y + outer.height / 2,
    Math.max(0, outer.width - 34),
  );
}

function drawGpuRetainedContentColorPickerChevron({
  ctx,
  disabled,
  outer,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
}) {
  const chevronCenterX = outer.x + outer.width - 8;
  const chevronCenterY = outer.y + outer.height / 2;
  ctx.beginPath();
  ctx.moveTo(chevronCenterX - 3, chevronCenterY - 1);
  ctx.lineTo(chevronCenterX, chevronCenterY + 2);
  ctx.lineTo(chevronCenterX + 3, chevronCenterY - 1);
  ctx.strokeStyle = disabled ? "#94a3b8" : "#475569";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
}

function drawGpuRetainedContentColorPickerRowTextChevron({
  ctx,
  outer,
  strokeStyle,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly outer: GpuRect;
  readonly strokeStyle: string;
}) {
  const chevronCenterX = outer.x + outer.width - 8;
  const chevronCenterY = outer.y + outer.height / 2;
  ctx.beginPath();
  ctx.moveTo(chevronCenterX - 3, chevronCenterY - 1);
  ctx.lineTo(chevronCenterX, chevronCenterY + 2);
  ctx.lineTo(chevronCenterX + 3, chevronCenterY - 1);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
}

function drawGpuRetainedContentNativeColorGlyph({
  ctx,
  outer,
  strokeStyle,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly outer: GpuRect;
  readonly strokeStyle: string;
}) {
  const centerX = outer.x + outer.width / 2;
  const centerY = outer.y + outer.height / 2;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(centerX - 4, centerY + 4);
  ctx.lineTo(centerX + 4, centerY - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX + 3.5, centerY - 3.5, 1.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineCap = "butt";
}

function getGpuRetainedContentColorPickerLabel({
  control,
  selectedChoice,
}: {
  readonly control: GpuRetainedContentColorPickerControl;
  readonly selectedChoice: GpuRetainedContentColorChoice | null;
}): string {
  return (
    selectedChoice?.description || selectedChoice?.color || control.displayValue
  );
}

function getGpuRetainedContentSelectedColorChoice(
  control: GpuRetainedContentColorPickerControl,
): GpuRetainedContentColorChoice | null {
  if (control.selectedIndex === null) {
    return control.choices[0] ?? null;
  }
  return control.choices[control.selectedIndex] ?? control.choices[0] ?? null;
}

export function getGpuRetainedContentColorPickerOuterRect(
  rect: GpuRect,
  palette: GpuRetainedContentCanvasPalette,
): GpuRect {
  if (palette.textLikeVisualStyle === "row-text") {
    return insetRectBySides(rect, 14, 2, 5);
  }
  return insetRect(rect, 6, 5);
}

function getGpuRetainedContentColorSwatchRect(outer: GpuRect): GpuRect {
  const swatchSize = Math.max(0, Math.min(14, outer.height - 6));
  return {
    height: swatchSize,
    width: swatchSize,
    x: outer.x + 5,
    y: outer.y + (outer.height - swatchSize) / 2,
  };
}

function getGpuRetainedContentColorPopupSwatchRect(rect: GpuRect): GpuRect {
  const swatchSize = Math.max(0, Math.min(14, rect.height - 8));
  return {
    height: swatchSize,
    width: swatchSize,
    x: rect.x + 6,
    y: rect.y + (rect.height - swatchSize) / 2,
  };
}

function insetRect(rect: GpuRect, insetX: number, insetY: number): GpuRect {
  return {
    height: Math.max(0, rect.height - insetY * 2),
    width: Math.max(0, rect.width - insetX * 2),
    x: rect.x + insetX,
    y: rect.y + insetY,
  };
}

function insetRectBySides(
  rect: GpuRect,
  insetLeft: number,
  insetRight: number,
  insetY: number,
): GpuRect {
  return {
    height: Math.max(0, rect.height - insetY * 2),
    width: Math.max(0, rect.width - insetLeft - insetRight),
    x: rect.x + insetLeft,
    y: rect.y + insetY,
  };
}

function getGpuRetainedContentContrastTextColor(
  color: string,
  fallback: string,
): string {
  const rgb = parseHexColor(color);
  if (!rgb) {
    return fallback;
  }
  const channelMax = Math.max(rgb.r, rgb.g, rgb.b);
  const channelMin = Math.min(rgb.r, rgb.g, rgb.b);
  const lightness = (channelMax + channelMin) / 510;
  return lightness >= 0.5 ? "#0f172a" : "#f8fafc";
}

function parseHexColor(
  color: string,
): { readonly b: number; readonly g: number; readonly r: number } | null {
  const value = color.trim();
  const shortHexMatch = /^#([0-9a-f]{3})$/i.exec(value);
  if (shortHexMatch) {
    const hex = shortHexMatch[1];
    if (!hex) {
      return null;
    }
    return {
      r: Number.parseInt(hex.charAt(0) + hex.charAt(0), 16),
      g: Number.parseInt(hex.charAt(1) + hex.charAt(1), 16),
      b: Number.parseInt(hex.charAt(2) + hex.charAt(2), 16),
    };
  }
  const longHexMatch = /^#([0-9a-f]{6})$/i.exec(value);
  if (!longHexMatch) {
    return null;
  }
  const hex = longHexMatch[1];
  if (!hex) {
    return null;
  }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  radius: number,
) {
  createRoundRectPath(ctx, rect, radius);
  ctx.fill();
}

function strokeRoundRect(
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
  const normalizedRadius = Math.max(
    0,
    Math.min(radius, rect.width / 2, rect.height / 2),
  );
  ctx.beginPath();
  ctx.moveTo(rect.x + normalizedRadius, rect.y);
  ctx.lineTo(rect.x + rect.width - normalizedRadius, rect.y);
  ctx.quadraticCurveTo(
    rect.x + rect.width,
    rect.y,
    rect.x + rect.width,
    rect.y + normalizedRadius,
  );
  ctx.lineTo(rect.x + rect.width, rect.y + rect.height - normalizedRadius);
  ctx.quadraticCurveTo(
    rect.x + rect.width,
    rect.y + rect.height,
    rect.x + rect.width - normalizedRadius,
    rect.y + rect.height,
  );
  ctx.lineTo(rect.x + normalizedRadius, rect.y + rect.height);
  ctx.quadraticCurveTo(
    rect.x,
    rect.y + rect.height,
    rect.x,
    rect.y + rect.height - normalizedRadius,
  );
  ctx.lineTo(rect.x, rect.y + normalizedRadius);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + normalizedRadius, rect.y);
  ctx.closePath();
}
