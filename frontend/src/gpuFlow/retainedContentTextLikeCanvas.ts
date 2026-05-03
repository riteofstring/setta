import { fillRoundRect, strokeRoundRect } from "./retainedContentCanvasDrawing";
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
  rect,
  state,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "text-like" }
  >;
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const disabled = state?.disabled ?? false;
  const outer = insetRect(rect, 6, 5);
  ctx.fillStyle = disabled ? "#f1f5f9" : "#ffffff";
  ctx.strokeStyle = getTextLikeControlStrokeColor(state);
  ctx.lineWidth = 1;
  fillRoundRect(ctx, outer, 4);
  strokeRoundRect(ctx, outer, 4);
  ctx.font = getTextLikeControlFont(control);
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillStyle = disabled ? "#94a3b8" : "#334155";
  ctx.fillText(
    getTextLikeControlText(control),
    outer.x + 7,
    outer.y + outer.height / 2,
    Math.max(0, outer.width - 14),
  );
}

function getTextLikeControlStrokeColor(
  state: GpuRetainedContentRowState | undefined,
): string {
  if (state?.focused) {
    return "#2563eb";
  }
  if (state?.selected) {
    return "#93c5fd";
  }
  return "#cbd5e1";
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
