import { fillRoundRect } from "./retainedContentCanvasDrawing";
import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentSwitchControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "switch" }
>;

export type GpuRetainedContentSwitchVisualParts = {
  readonly thumbColor: string;
  readonly thumbRect: GpuRect;
  readonly trackColor: string;
  readonly trackRect: GpuRect;
};

const SWITCH_CONTROL_INSET_X = 6;
const SWITCH_CONTROL_INSET_Y = 5;
const SWITCH_TRACK_LEFT_OFFSET = 8;
const SWITCH_TRACK_MAX_WIDTH = 34;
const SWITCH_TRACK_MAX_HEIGHT = 16;
const SWITCH_ROW_TEXT_TRACK_OFFSET_Y = 6;
const SWITCH_THUMB_INSET = 2;
const SWITCH_ROW_TEXT_THUMB_INSET = 3;

export function drawGpuRetainedContentSwitchControl({
  animationProgress,
  animationTargetChecked,
  control,
  ctx,
  palette,
  rect,
  state,
}: {
  readonly animationProgress?: number | undefined;
  readonly animationTargetChecked?: boolean | undefined;
  readonly control: GpuRetainedContentSwitchControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const parts = getGpuRetainedContentSwitchVisualParts({
    animationProgress,
    animationTargetChecked,
    control,
    palette,
    rect,
    state,
  });
  ctx.fillStyle = parts.trackColor;
  fillRoundRect(ctx, parts.trackRect, parts.trackRect.height / 2);

  ctx.fillStyle = parts.thumbColor;
  fillRoundRect(ctx, parts.thumbRect, parts.thumbRect.height / 2);
}

export function getGpuRetainedContentSwitchVisualParts({
  animationProgress,
  animationTargetChecked,
  control,
  palette,
  rect,
  state,
}: {
  readonly animationProgress?: number | undefined;
  readonly animationTargetChecked?: boolean | undefined;
  readonly control: GpuRetainedContentSwitchControl;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}): GpuRetainedContentSwitchVisualParts {
  const disabled = state?.disabled ?? false;
  const rowTextStyle = palette.textLikeVisualStyle === "row-text";
  const trackRect = rowTextStyle
    ? getGpuRetainedContentRowTextSwitchTrackRect(rect)
    : getGpuRetainedContentSwitchTrackRect(rect);
  const checkedProgress = normalizeGpuRetainedContentSwitchAnimationProgress(
    animationProgress,
    control.checked,
  );
  const thumbRect = getGpuRetainedContentSwitchThumbRect({
    checkedProgress,
    trackRect,
    thumbInset: rowTextStyle ? SWITCH_ROW_TEXT_THUMB_INSET : SWITCH_THUMB_INSET,
  });
  return {
    thumbColor: getGpuRetainedContentSwitchThumbColor({
      disabled,
      palette,
    }),
    thumbRect,
    trackColor: getGpuRetainedContentSwitchTrackColor({
      checked: animationTargetChecked ?? control.checked,
      disabled,
      palette,
    }),
    trackRect,
  };
}

export function getGpuRetainedContentSwitchTrackRect(rect: GpuRect): GpuRect {
  const outer = insetRect(rect, SWITCH_CONTROL_INSET_X, SWITCH_CONTROL_INSET_Y);
  const width = Math.min(
    SWITCH_TRACK_MAX_WIDTH,
    Math.max(0, outer.width - SWITCH_TRACK_LEFT_OFFSET),
  );
  const height = Math.min(SWITCH_TRACK_MAX_HEIGHT, Math.max(0, outer.height));
  const leftOffset = Math.min(
    SWITCH_TRACK_LEFT_OFFSET,
    Math.max(0, outer.width - width),
  );
  return {
    height,
    width,
    x: outer.x + leftOffset,
    y: outer.y + (outer.height - height) / 2,
  };
}

function getGpuRetainedContentRowTextSwitchTrackRect(rect: GpuRect): GpuRect {
  const outer = insetRect(rect, SWITCH_CONTROL_INSET_X, 0);
  const width = Math.min(
    SWITCH_TRACK_MAX_WIDTH,
    Math.max(0, outer.width - SWITCH_TRACK_LEFT_OFFSET),
  );
  const height = Math.min(SWITCH_TRACK_MAX_HEIGHT, Math.max(0, rect.height));
  const leftOffset = Math.min(
    SWITCH_TRACK_LEFT_OFFSET,
    Math.max(0, outer.width - width),
  );
  return {
    height,
    width,
    x: outer.x + leftOffset,
    y:
      rect.y +
      Math.min(
        SWITCH_ROW_TEXT_TRACK_OFFSET_Y,
        Math.max(0, rect.height - height),
      ),
  };
}

function getGpuRetainedContentSwitchThumbRect({
  checkedProgress,
  thumbInset,
  trackRect,
}: {
  readonly checkedProgress: number;
  readonly thumbInset: number;
  readonly trackRect: GpuRect;
}): GpuRect {
  const size = Math.max(0, trackRect.height - thumbInset * 2);
  const travel = Math.max(0, trackRect.width - size - thumbInset * 2);
  return {
    height: size,
    width: size,
    x: trackRect.x + thumbInset + travel * checkedProgress,
    y: trackRect.y + thumbInset,
  };
}

function normalizeGpuRetainedContentSwitchAnimationProgress(
  animationProgress: number | undefined,
  checked: boolean,
): number {
  if (animationProgress === undefined) {
    return checked ? 1 : 0;
  }
  if (!Number.isFinite(animationProgress)) {
    throw new Error(
      "Retained content switch animation progress must be finite.",
    );
  }
  return Math.min(1, Math.max(0, animationProgress));
}

function getGpuRetainedContentSwitchTrackColor({
  checked,
  disabled,
  palette,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly palette: GpuRetainedContentCanvasPalette;
}): string {
  if (palette.textLikeVisualStyle !== "row-text") {
    if (disabled) {
      return "#cbd5e1";
    }
    return checked ? "#2563eb" : "#94a3b8";
  }
  if (disabled) {
    return "hsl(219, 25%, 34%)";
  }
  return checked ? "#1d4ed8" : "hsl(219, 25%, 34%)";
}

function getGpuRetainedContentSwitchThumbColor({
  disabled,
  palette,
}: {
  readonly disabled: boolean;
  readonly palette: GpuRetainedContentCanvasPalette;
}): string {
  if (palette.textLikeVisualStyle !== "row-text") {
    return disabled ? "#f1f5f9" : "#ffffff";
  }
  if (disabled) {
    return "rgb(100, 116, 139)";
  }
  return "hsl(220, 26%, 14%)";
}

function insetRect(rect: GpuRect, x: number, y: number): GpuRect {
  return {
    height: Math.max(0, rect.height - y * 2),
    width: Math.max(0, rect.width - x * 2),
    x: rect.x + x,
    y: rect.y + y,
  };
}
