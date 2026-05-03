import { getGpuRetainedContentPasswordLayout } from "./retainedContentPasswordLayout";
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
  const layout = getGpuRetainedContentPasswordLayout({ control, rect });

  drawGpuRetainedContentPasswordField({
    control,
    ctx,
    disabled,
    layout,
  });
  if (layout.revealRect) {
    drawGpuRetainedContentPasswordReveal({
      control,
      ctx,
      disabled,
      revealRect: layout.revealRect,
    });
  }
}

function drawGpuRetainedContentPasswordField({
  control,
  ctx,
  disabled,
  layout,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "password" }
  >;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly layout: ReturnType<typeof getGpuRetainedContentPasswordLayout>;
}) {
  const { outerRect, valueRect } = layout;
  ctx.fillStyle = disabled ? "#f1f5f9" : "#ffffff";
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  fillRoundRect(ctx, outerRect, 5);
  strokeRoundRect(ctx, outerRect, 5);

  ctx.font = PASSWORD_VALUE_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = disabled ? "#94a3b8" : "#334155";
  ctx.fillText(
    getGpuRetainedContentPasswordDisplayText(control),
    valueRect.x + 7,
    valueRect.y + valueRect.height / 2,
    Math.max(0, valueRect.width - 8),
  );
  ctx.textAlign = "start";
}

function drawGpuRetainedContentPasswordReveal({
  control,
  ctx,
  disabled,
  revealRect,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "password" }
  >;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly revealRect: GpuRect;
}) {
  ctx.beginPath();
  ctx.moveTo(revealRect.x - 3, revealRect.y + 5);
  ctx.lineTo(revealRect.x - 3, revealRect.y + revealRect.height - 5);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = PASSWORD_CONTROL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = disabled ? "#94a3b8" : "#2563eb";
  ctx.fillText(
    getGpuRetainedContentPasswordRevealLabel(control),
    revealRect.x + revealRect.width / 2,
    revealRect.y + revealRect.height / 2,
    Math.max(0, revealRect.width - 4),
  );
  ctx.textAlign = "start";
}

function getGpuRetainedContentPasswordDisplayText(
  control: Extract<GpuRetainedContentControlDescriptor, { kind: "password" }>,
): string {
  if (control.revealPending) {
    return "Loading";
  }
  if (control.revealedValue !== null) {
    return control.revealedValue;
  }
  if (control.displayValue.length > 0) {
    return "********";
  }
  if (control.placeholder.length > 0) {
    return control.placeholder;
  }
  return control.hasSecret ? "Saved" : "Empty";
}

function getGpuRetainedContentPasswordRevealLabel(
  control: Extract<GpuRetainedContentControlDescriptor, { kind: "password" }>,
): string {
  if (control.revealPending) {
    return "...";
  }
  return control.revealedValue !== null ? "Hide" : "Reveal";
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
