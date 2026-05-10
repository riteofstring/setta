import type { GpuRetainedContentControlDescriptor } from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

const PASSWORD_FIELD_INSET_X_PX = 6;
const PASSWORD_FIELD_INSET_Y_PX = 5;
const PASSWORD_REVEAL_GAP_PX = 6;
const PASSWORD_REVEAL_MAX_WIDTH_PX = 44;

type GpuRetainedContentPasswordControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "password" }
>;

type GpuRetainedContentPasswordLayout = {
  readonly outerRect: GpuRect;
  readonly revealRect: GpuRect | null;
  readonly valueRect: GpuRect;
};

export function getGpuRetainedContentPasswordLayout({
  control,
  rect,
}: {
  readonly control: GpuRetainedContentPasswordControl;
  readonly rect: GpuRect;
}): GpuRetainedContentPasswordLayout {
  const outerRect = insetRect(
    rect,
    PASSWORD_FIELD_INSET_X_PX,
    PASSWORD_FIELD_INSET_Y_PX,
  );
  const revealWidth = hasGpuRetainedContentPasswordRevealAffordance(control)
    ? Math.min(PASSWORD_REVEAL_MAX_WIDTH_PX, outerRect.width)
    : 0;
  const revealRect =
    revealWidth > 0
      ? {
          height: outerRect.height,
          width: revealWidth,
          x: outerRect.x + outerRect.width - revealWidth,
          y: outerRect.y,
        }
      : null;
  return {
    outerRect,
    revealRect,
    valueRect: {
      height: outerRect.height,
      width: Math.max(
        0,
        outerRect.width -
          revealWidth -
          (revealRect ? PASSWORD_REVEAL_GAP_PX : 0),
      ),
      x: outerRect.x,
      y: outerRect.y,
    },
  };
}

function hasGpuRetainedContentPasswordRevealAffordance(
  control: GpuRetainedContentPasswordControl,
): boolean {
  return (
    control.revealAvailable ||
    control.revealPending ||
    control.revealedValue !== null
  );
}

function insetRect(rect: GpuRect, insetX: number, insetY: number): GpuRect {
  return {
    height: Math.max(0, rect.height - insetY * 2),
    width: Math.max(0, rect.width - insetX * 2),
    x: rect.x + insetX,
    y: rect.y + insetY,
  };
}
