import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

const DROPZONE_CONTROL_FONT =
  "10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const DROPZONE_LABEL_FONT =
  "11px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

type GpuRetainedContentDropzoneControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "dropzone" }
>;

export function drawGpuRetainedContentDropzoneControl({
  control,
  ctx,
  rect,
  state,
}: {
  readonly control: GpuRetainedContentDropzoneControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const disabled = state?.disabled ?? false;
  const outer = insetRect(rect, 6, 4);
  const iconRect = getGpuRetainedContentDropzoneIconRect(outer);
  const textRect = {
    height: outer.height,
    width: Math.max(0, outer.width - iconRect.width - 8),
    x: iconRect.x + iconRect.width + 6,
    y: outer.y,
  };

  ctx.fillStyle = disabled ? "#f1f5f9" : "#ffffff";
  ctx.strokeStyle = control.canAttachMore && !disabled ? "#93c5fd" : "#cbd5e1";
  ctx.lineWidth = 1;
  fillRoundRect(ctx, outer, 5);
  strokeRoundRect(ctx, outer, 5);

  drawGpuRetainedContentDropzoneIcon({
    ctx,
    disabled,
    hasAttachments: control.attachments.length > 0,
    rect: iconRect,
  });
  drawGpuRetainedContentDropzoneText({
    control,
    ctx,
    disabled,
    rect: textRect,
  });
}

function drawGpuRetainedContentDropzoneIcon({
  ctx,
  disabled,
  hasAttachments,
  rect,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly hasAttachments: boolean;
  readonly rect: GpuRect;
}) {
  ctx.fillStyle = disabled ? "#e2e8f0" : hasAttachments ? "#dbeafe" : "#eff6ff";
  fillRoundRect(ctx, rect, 4);

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - 4);
  ctx.lineTo(centerX, centerY + 4);
  ctx.moveTo(centerX - 4, centerY);
  ctx.lineTo(centerX, centerY - 4);
  ctx.lineTo(centerX + 4, centerY);
  ctx.strokeStyle = disabled ? "#94a3b8" : "#2563eb";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
}

function drawGpuRetainedContentDropzoneText({
  control,
  ctx,
  disabled,
  rect,
}: {
  readonly control: GpuRetainedContentDropzoneControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly rect: GpuRect;
}) {
  const secondaryText = getGpuRetainedContentDropzoneSecondaryText(control);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = DROPZONE_LABEL_FONT;
  ctx.fillStyle = disabled ? "#94a3b8" : "#334155";
  ctx.fillText(
    control.label,
    rect.x,
    rect.y + rect.height * (secondaryText ? 0.35 : 0.5),
    Math.max(0, rect.width),
  );
  if (secondaryText) {
    ctx.font = DROPZONE_CONTROL_FONT;
    ctx.fillStyle = disabled ? "#cbd5e1" : "#64748b";
    ctx.fillText(
      secondaryText,
      rect.x,
      rect.y + rect.height * 0.72,
      Math.max(0, rect.width),
    );
  }
  ctx.textAlign = "start";
}

export function getGpuRetainedContentDropzoneSecondaryText(
  control: GpuRetainedContentDropzoneControl,
): string {
  const firstAttachment = control.attachments[0];
  if (firstAttachment) {
    const suffix =
      control.attachments.length > 1
        ? ` +${control.attachments.length - 1}`
        : "";
    const sizeSuffix = firstAttachment.sizeLabel
      ? ` - ${firstAttachment.sizeLabel}`
      : "";
    return `${firstAttachment.name}${sizeSuffix}${suffix}`;
  }
  if (!control.canAttachMore) {
    return "Attachment limit reached";
  }
  if (control.remainingSlots !== null) {
    const suffix = control.remainingSlots === 1 ? "" : "s";
    return `${control.remainingSlots} slot${suffix} left`;
  }
  return "Ready";
}

function getGpuRetainedContentDropzoneIconRect(outer: GpuRect): GpuRect {
  const size = Math.min(18, Math.max(0, outer.height - 4));
  return {
    height: size,
    width: size,
    x: outer.x + 4,
    y: outer.y + (outer.height - size) / 2,
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
