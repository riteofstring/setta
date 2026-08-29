/**
 * Frozen-main responsive bottom-dock geometry. These values intentionally
 * match the reference UI so dock presenters can share one sizing authority.
 */
export const WORKSPACE_BOTTOM_DOCK_WINDOW_GAP_PX = 12;
export const WORKSPACE_BOTTOM_DOCK_COMPACT_PILL_WIDTH_PX = 28;
export const WORKSPACE_BOTTOM_DOCK_CYCLE_CONTROL_BUTTON_WIDTH_PX = 24;
const WORKSPACE_BOTTOM_DOCK_MENU_MODE_TRIGGER_WIDTH_PX = 28;
export const WORKSPACE_BOTTOM_DOCK_PILL_GAP_PX = 4;
const WORKSPACE_BOTTOM_DOCK_MINIMIZED_PILL_STRIP_HORIZONTAL_PADDING_PX = 16;
export const WORKSPACE_BOTTOM_DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX = 4;
export const WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX = 280;
export const WORKSPACE_BOTTOM_DOCK_DEFAULT_WINDOW_WIDTH_PX = 460;
export const WORKSPACE_BOTTOM_DOCK_SURFACE_MAX_WIDTH_PX = 1160;
const WORKSPACE_BOTTOM_DOCK_NARROW_MENU_BREAKPOINT_PX = 520;

const WORKSPACE_BOTTOM_DOCK_WIDTH_TOLERANCE_PX = 0.5;
const WORKSPACE_BOTTOM_DOCK_PERSISTENT_MANAGER_TRIGGER_RESERVED_WIDTH_PX =
  WORKSPACE_BOTTOM_DOCK_MENU_MODE_TRIGGER_WIDTH_PX +
  WORKSPACE_BOTTOM_DOCK_PILL_GAP_PX;
const WORKSPACE_BOTTOM_DOCK_MINIMIZED_STRIP_RESERVED_WIDTH_PX =
  WORKSPACE_BOTTOM_DOCK_MINIMIZED_PILL_STRIP_HORIZONTAL_PADDING_PX +
  WORKSPACE_BOTTOM_DOCK_CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 +
  WORKSPACE_BOTTOM_DOCK_COMPACT_PILL_WIDTH_PX * 2 +
  WORKSPACE_BOTTOM_DOCK_PILL_GAP_PX * 3 +
  WORKSPACE_BOTTOM_DOCK_WINDOW_GAP_PX;

export type WorkspaceBottomDockPillDisplayMode =
  "full" | "compact" | "cycle" | "menu";

function clampNumber(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

function getAvailableDockPanelWidthPx(
  dockedWindowCount: number,
  availableWidthPx: number,
): number {
  const gapWidthPx =
    Math.max(0, dockedWindowCount - 1) * WORKSPACE_BOTTOM_DOCK_WINDOW_GAP_PX;
  return (
    availableWidthPx -
    WORKSPACE_BOTTOM_DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2 -
    gapWidthPx
  );
}

function createResolvedDockWidths<T extends { id: string }>(
  dockedWindows: readonly T[],
  desiredWidthsById: Record<string, number>,
): number[] {
  return dockedWindows.map((window) =>
    clampNumber(
      desiredWidthsById[window.id] ??
        WORKSPACE_BOTTOM_DOCK_DEFAULT_WINDOW_WIDTH_PX,
      WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX,
      WORKSPACE_BOTTOM_DOCK_SURFACE_MAX_WIDTH_PX,
    ),
  );
}

function mapDockWindowWidthsById<T extends { id: string }>(
  dockedWindows: readonly T[],
  widths: readonly number[],
): Record<string, number> {
  const nextWidthsById: Record<string, number> = {};
  dockedWindows.forEach((window, index) => {
    nextWidthsById[window.id] =
      widths[index] ?? WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX;
  });
  return nextWidthsById;
}

function getShrinkableWidthIndices(widths: readonly number[]): number[] {
  return widths
    .map((_, index) => index)
    .filter(
      (index) =>
        (widths[index] ?? WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX) >
        WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX +
          WORKSPACE_BOTTOM_DOCK_WIDTH_TOLERANCE_PX,
    );
}

function getTotalDockShrinkCapacityPx(
  widths: readonly number[],
  shrinkableIndices: readonly number[],
): number {
  return shrinkableIndices.reduce((sum, index) => {
    return (
      sum +
      ((widths[index] ?? WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX) -
        WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX)
    );
  }, 0);
}

function applyDockWidthReduction(
  widths: number[],
  remainingReductionPx: number,
  shrinkableIndices: readonly number[],
  totalShrinkCapacityPx: number,
): number {
  let appliedReductionPx = 0;
  for (const index of shrinkableIndices) {
    const widthPx = widths[index];
    if (widthPx === undefined) {
      continue;
    }
    const capacityPx = widthPx - WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX;
    const proportionalReductionPx =
      remainingReductionPx * (capacityPx / totalShrinkCapacityPx);
    const nextWidthPx = Math.max(
      WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX,
      widthPx - proportionalReductionPx,
    );
    appliedReductionPx += widthPx - nextWidthPx;
    widths[index] = nextWidthPx;
  }
  return appliedReductionPx;
}

function shrinkDockWindowWidthsToFit(
  resolvedWidths: readonly number[],
  availablePanelWidthPx: number,
): number[] {
  const nextWidths = [...resolvedWidths];
  let remainingReductionPx =
    resolvedWidths.reduce((sum, widthPx) => sum + widthPx, 0) -
    availablePanelWidthPx;
  while (remainingReductionPx > WORKSPACE_BOTTOM_DOCK_WIDTH_TOLERANCE_PX) {
    const shrinkableIndices = getShrinkableWidthIndices(nextWidths);
    if (shrinkableIndices.length === 0) {
      break;
    }
    const totalShrinkCapacityPx = getTotalDockShrinkCapacityPx(
      nextWidths,
      shrinkableIndices,
    );
    if (totalShrinkCapacityPx <= WORKSPACE_BOTTOM_DOCK_WIDTH_TOLERANCE_PX) {
      break;
    }
    const appliedReductionPx = applyDockWidthReduction(
      nextWidths,
      remainingReductionPx,
      shrinkableIndices,
      totalShrinkCapacityPx,
    );
    if (appliedReductionPx <= WORKSPACE_BOTTOM_DOCK_WIDTH_TOLERANCE_PX) {
      break;
    }
    remainingReductionPx = Math.max(
      0,
      remainingReductionPx - appliedReductionPx,
    );
  }
  return nextWidths;
}

/**
 * Reserves horizontal dock-row space for recovery affordances. The manager
 * trigger remains reserved whenever its host renders it.
 */
export function resolveWorkspaceBottomDockStripReservedWidthPx({
  nonClosedWindowCount,
  showManagerMenu,
}: {
  nonClosedWindowCount: number;
  showManagerMenu: boolean;
}): number {
  if (nonClosedWindowCount > 1) {
    return (
      WORKSPACE_BOTTOM_DOCK_MINIMIZED_STRIP_RESERVED_WIDTH_PX +
      (showManagerMenu
        ? WORKSPACE_BOTTOM_DOCK_PERSISTENT_MANAGER_TRIGGER_RESERVED_WIDTH_PX
        : 0)
    );
  }
  return (
    WORKSPACE_BOTTOM_DOCK_MINIMIZED_PILL_STRIP_HORIZONTAL_PADDING_PX +
    WORKSPACE_BOTTOM_DOCK_COMPACT_PILL_WIDTH_PX +
    WORKSPACE_BOTTOM_DOCK_WINDOW_GAP_PX +
    (showManagerMenu
      ? WORKSPACE_BOTTOM_DOCK_MENU_MODE_TRIGGER_WIDTH_PX +
        WORKSPACE_BOTTOM_DOCK_PILL_GAP_PX
      : 0)
  );
}

/** Returns the number of whole 280px-minimum panels that can fit in the row. */
export function resolveWorkspaceMaxVisibleBottomDockWindowCount(
  totalWindowCount: number,
  availableWidthPx: number,
): number {
  for (let count = totalWindowCount; count >= 1; count -= 1) {
    const minimumWidthPx =
      count * WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX +
      Math.max(0, count - 1) * WORKSPACE_BOTTOM_DOCK_WINDOW_GAP_PX +
      WORKSPACE_BOTTOM_DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2;
    if (
      minimumWidthPx <=
      availableWidthPx + WORKSPACE_BOTTOM_DOCK_WIDTH_TOLERANCE_PX
    ) {
      return count;
    }
  }
  return 0;
}

/**
 * Resolves desired panel widths in item order. Excess width is removed in
 * proportion to each panel's remaining shrink capacity, never below 280px.
 */
export function resolveWorkspaceBottomDockWindowWidthsToFit<
  T extends { id: string },
>(
  dockedWindows: readonly T[],
  desiredWidthsById: Record<string, number>,
  availableWidthPx: number,
): Record<string, number> {
  if (dockedWindows.length === 0) {
    return {};
  }
  const availablePanelWidthPx = getAvailableDockPanelWidthPx(
    dockedWindows.length,
    availableWidthPx,
  );
  if (availablePanelWidthPx <= 0) {
    return {};
  }
  const resolvedWidths = createResolvedDockWidths(
    dockedWindows,
    desiredWidthsById,
  );
  const totalDesiredWidthPx = resolvedWidths.reduce(
    (sum, widthPx) => sum + widthPx,
    0,
  );
  if (
    totalDesiredWidthPx <=
    availablePanelWidthPx + WORKSPACE_BOTTOM_DOCK_WIDTH_TOLERANCE_PX
  ) {
    return mapDockWindowWidthsById(dockedWindows, resolvedWidths);
  }
  const minTotalWidthPx =
    dockedWindows.length * WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX;
  if (
    minTotalWidthPx >=
    availablePanelWidthPx - WORKSPACE_BOTTOM_DOCK_WIDTH_TOLERANCE_PX
  ) {
    return mapDockWindowWidthsById(
      dockedWindows,
      dockedWindows.map(() => WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_WIDTH_PX),
    );
  }
  return mapDockWindowWidthsById(
    dockedWindows,
    shrinkDockWindowWidthsToFit(resolvedWidths, availablePanelWidthPx),
  );
}

/** Chooses the frozen full-title, compact, cycle, or manager-menu pill mode. */
export function resolveNextWorkspaceBottomDockPillDisplayMode({
  currentMode,
  stripPillCount,
  viewportWidthPx,
  availableWidthPx,
  fullWidthPx,
  compactWidthPx,
}: {
  currentMode: WorkspaceBottomDockPillDisplayMode;
  stripPillCount: number;
  viewportWidthPx: number;
  availableWidthPx: number;
  fullWidthPx: number;
  compactWidthPx: number;
}): WorkspaceBottomDockPillDisplayMode {
  if (availableWidthPx <= 0) {
    return currentMode;
  }
  if (
    stripPillCount > 1 &&
    viewportWidthPx > 0 &&
    viewportWidthPx <= WORKSPACE_BOTTOM_DOCK_NARROW_MENU_BREAKPOINT_PX
  ) {
    return "menu";
  }
  if (fullWidthPx <= availableWidthPx + 1) {
    return "full";
  }
  if (compactWidthPx <= availableWidthPx + 1) {
    return "compact";
  }
  const minimumCycleWidthPx =
    WORKSPACE_BOTTOM_DOCK_CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 +
    WORKSPACE_BOTTOM_DOCK_COMPACT_PILL_WIDTH_PX * 2 +
    WORKSPACE_BOTTOM_DOCK_PILL_GAP_PX * 3;
  if (availableWidthPx <= minimumCycleWidthPx + 1) {
    return "menu";
  }
  return "cycle";
}
