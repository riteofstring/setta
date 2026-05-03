import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

const PASSWORD_CONTROL_FONT =
  "10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const PASSWORD_VALUE_FONT =
  "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export function drawGpuRetainedContentPasswordControl({
  control,
  ctx,
  rect,
  state,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "password" }
  >;
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const disabled = state?.disabled ?? false;
  const outer = insetRect(rect, 6, 5);
  const revealWidth = control.revealAvailable ? Math.min(44, outer.width) : 0;
  const valueWidth = Math.max(0, outer.width - revealWidth - 6);

  drawGpuRetainedContentPasswordField({
    control,
    ctx,
    disabled,
    outer,
    valueWidth,
  });
  if (control.revealAvailable) {
    drawGpuRetainedContentPasswordReveal({
      ctx,
      disabled,
      outer,
      revealWidth,
    });
  }
}

function drawGpuRetainedContentPasswordField({
  control,
  ctx,
  disabled,
  outer,
  valueWidth,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "password" }
  >;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
  readonly valueWidth: number;
}) {
  ctx.fillStyle = disabled ? "#f1f5f9" : "#ffffff";
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  fillRoundRect(ctx, outer, 5);
  strokeRoundRect(ctx, outer, 5);

  ctx.font = PASSWORD_VALUE_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = disabled ? "#94a3b8" : "#334155";
  ctx.fillText(
    getGpuRetainedContentPasswordDisplayText(control),
    outer.x + 7,
    outer.y + outer.height / 2,
    Math.max(0, valueWidth - 8),
  );
  ctx.textAlign = "start";
}

function drawGpuRetainedContentPasswordReveal({
  ctx,
  disabled,
  outer,
  revealWidth,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
  readonly revealWidth: number;
}) {
  const revealX = outer.x + outer.width - revealWidth;
  ctx.beginPath();
  ctx.moveTo(revealX - 3, outer.y + 5);
  ctx.lineTo(revealX - 3, outer.y + outer.height - 5);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = PASSWORD_CONTROL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = disabled ? "#94a3b8" : "#2563eb";
  ctx.fillText(
    "Reveal",
    revealX + revealWidth / 2,
    outer.y + outer.height / 2,
    Math.max(0, revealWidth - 4),
  );
  ctx.textAlign = "start";
}

function getGpuRetainedContentPasswordDisplayText(
  control: Extract<GpuRetainedContentControlDescriptor, { kind: "password" }>,
): string {
  if (control.displayValue.length > 0) {
    return "********";
  }
  if (control.placeholder.length > 0) {
    return control.placeholder;
  }
  return control.hasSecret ? "Saved" : "Empty";
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
