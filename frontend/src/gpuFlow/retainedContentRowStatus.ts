import { clampNumber } from "./retainedContentMath";
import type { GpuRect } from "./viewportMath";

export type GpuRetainedContentRowStatus = {
  readonly kind: "error";
  readonly messages: readonly string[];
  readonly summary: string;
};

type GpuRetainedContentStatusOverlayRow = {
  readonly state: {
    readonly focused: boolean;
    readonly hovered: boolean;
    readonly searchFocused: boolean;
  };
  readonly status: GpuRetainedContentRowStatus | null;
};

export function createGpuRetainedContentStatusBadgeRect({
  controlRect,
  labelControlGap,
  rowRect,
}: {
  readonly controlRect: GpuRect;
  readonly labelControlGap: number;
  readonly rowRect: GpuRect;
}): GpuRect | null {
  const size = Math.min(16, Math.max(0, rowRect.height - 8));
  if (size <= 0) {
    return null;
  }
  return {
    height: size,
    width: size,
    x: controlRect.x - labelControlGap - size,
    y: rowRect.y + (rowRect.height - size) / 2,
  };
}

export function createGpuRetainedContentStatusOverlayRect({
  badgeRect,
  row,
  viewportRect,
}: {
  readonly badgeRect: GpuRect;
  readonly row: GpuRetainedContentStatusOverlayRow;
  readonly viewportRect: GpuRect;
}): GpuRect | null {
  if (
    !row.status ||
    !(row.state.hovered || row.state.focused || row.state.searchFocused)
  ) {
    return null;
  }
  const margin = 6;
  const width = Math.min(260, Math.max(0, viewportRect.width - margin * 2));
  const height = Math.min(96, 28 + row.status.messages.length * 14);
  if (width < 80 || height <= 0) {
    return null;
  }
  const x = clampNumber(
    badgeRect.x - margin,
    viewportRect.x + margin,
    viewportRect.x + viewportRect.width - width - margin,
  );
  const belowY = badgeRect.y + badgeRect.height + margin;
  const aboveY = badgeRect.y - height - margin;
  const y =
    belowY + height <= viewportRect.y + viewportRect.height
      ? belowY
      : clampNumber(aboveY, viewportRect.y + margin, belowY);
  return { height, width, x, y };
}
