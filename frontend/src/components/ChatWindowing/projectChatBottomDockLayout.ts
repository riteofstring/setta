const DOCK_WINDOW_GAP_PX = 12;
const COMPACT_PILL_WIDTH_PX = 28;
const CYCLE_CONTROL_BUTTON_WIDTH_PX = 24;
const MENU_MODE_TRIGGER_WIDTH_PX = 28;
const PILL_GAP_PX = 4;
const MINIMIZED_PILL_STRIP_HORIZONTAL_PADDING_PX = 16;
const PERSISTENT_MANAGER_TRIGGER_RESERVED_WIDTH_PX =
  MENU_MODE_TRIGGER_WIDTH_PX + PILL_GAP_PX;
const DOCKED_MINIMIZED_STRIP_RESERVED_WIDTH_PX =
  MINIMIZED_PILL_STRIP_HORIZONTAL_PADDING_PX +
  CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 +
  COMPACT_PILL_WIDTH_PX * 2 +
  PILL_GAP_PX * 3 +
  DOCK_WINDOW_GAP_PX;
export const DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX = 4;
const MIN_DOCK_CHAT_WIDTH_PX = 280;
const DOCK_WINDOW_DEFAULT_WIDTH_PX = 460;
const DOCK_SURFACE_MAX_WIDTH_PX = 1160;
const DOCK_WIDTH_TOLERANCE_PX = 0.5;
const NARROW_CHAT_MENU_BREAKPOINT_PX = 520;

export type PillDisplayMode = "full" | "compact" | "cycle" | "menu";

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
  const gapWidthPx = Math.max(0, dockedWindowCount - 1) * DOCK_WINDOW_GAP_PX;
  return (
    availableWidthPx - DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2 - gapWidthPx
  );
}

function createResolvedDockWidths<T extends { instanceId: string }>(
  dockedPills: readonly T[],
  desiredWidthsById: Record<string, number>,
): number[] {
  return dockedPills.map((pill) =>
    clampNumber(
      desiredWidthsById[pill.instanceId] ?? DOCK_WINDOW_DEFAULT_WIDTH_PX,
      MIN_DOCK_CHAT_WIDTH_PX,
      DOCK_SURFACE_MAX_WIDTH_PX,
    ),
  );
}

function mapDockWindowWidthsById<T extends { instanceId: string }>(
  dockedPills: readonly T[],
  widths: readonly number[],
): Record<string, number> {
  const nextWidthsById: Record<string, number> = {};
  dockedPills.forEach((pill, index) => {
    nextWidthsById[pill.instanceId] = widths[index] ?? MIN_DOCK_CHAT_WIDTH_PX;
  });
  return nextWidthsById;
}

function getShrinkableWidthIndices(widths: readonly number[]): number[] {
  return widths
    .map((_, index) => index)
    .filter(
      (index) =>
        (widths[index] ?? MIN_DOCK_CHAT_WIDTH_PX) >
        MIN_DOCK_CHAT_WIDTH_PX + DOCK_WIDTH_TOLERANCE_PX,
    );
}

function getTotalDockShrinkCapacityPx(
  widths: readonly number[],
  shrinkableIndices: readonly number[],
): number {
  return shrinkableIndices.reduce((sum, index) => {
    return (
      sum + ((widths[index] ?? MIN_DOCK_CHAT_WIDTH_PX) - MIN_DOCK_CHAT_WIDTH_PX)
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
    const capacityPx = widthPx - MIN_DOCK_CHAT_WIDTH_PX;
    const proportionalReductionPx =
      remainingReductionPx * (capacityPx / totalShrinkCapacityPx);
    const nextWidthPx = Math.max(
      MIN_DOCK_CHAT_WIDTH_PX,
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
  while (remainingReductionPx > DOCK_WIDTH_TOLERANCE_PX) {
    const shrinkableIndices = getShrinkableWidthIndices(nextWidths);
    if (shrinkableIndices.length === 0) {
      break;
    }
    const totalShrinkCapacityPx = getTotalDockShrinkCapacityPx(
      nextWidths,
      shrinkableIndices,
    );
    if (totalShrinkCapacityPx <= DOCK_WIDTH_TOLERANCE_PX) {
      break;
    }
    const appliedReductionPx = applyDockWidthReduction(
      nextWidths,
      remainingReductionPx,
      shrinkableIndices,
      totalShrinkCapacityPx,
    );
    if (appliedReductionPx <= DOCK_WIDTH_TOLERANCE_PX) {
      break;
    }
    remainingReductionPx = Math.max(
      0,
      remainingReductionPx - appliedReductionPx,
    );
  }
  return nextWidths;
}

export function resolveDockStripReservedWidthPx({
  nonClosedChatCount,
  showManagerMenu,
}: {
  nonClosedChatCount: number;
  showManagerMenu: boolean;
}): number {
  if (nonClosedChatCount > 1) {
    return (
      DOCKED_MINIMIZED_STRIP_RESERVED_WIDTH_PX +
      (showManagerMenu ? PERSISTENT_MANAGER_TRIGGER_RESERVED_WIDTH_PX : 0)
    );
  }
  return (
    MINIMIZED_PILL_STRIP_HORIZONTAL_PADDING_PX +
    COMPACT_PILL_WIDTH_PX +
    DOCK_WINDOW_GAP_PX +
    (showManagerMenu ? MENU_MODE_TRIGGER_WIDTH_PX + PILL_GAP_PX : 0)
  );
}

export function resolveMaxVisibleDockWindowCount(
  totalWindowCount: number,
  availableWidthPx: number,
): number {
  for (let count = totalWindowCount; count >= 1; count -= 1) {
    const minimumWidthPx =
      count * MIN_DOCK_CHAT_WIDTH_PX +
      Math.max(0, count - 1) * DOCK_WINDOW_GAP_PX +
      DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2;
    if (minimumWidthPx <= availableWidthPx + DOCK_WIDTH_TOLERANCE_PX) {
      return count;
    }
  }
  return 0;
}

export function resolveDockWindowWidthsToFit<T extends { instanceId: string }>(
  dockedPills: readonly T[],
  desiredWidthsById: Record<string, number>,
  availableWidthPx: number,
): Record<string, number> {
  if (dockedPills.length === 0) {
    return {};
  }
  const availablePanelWidthPx = getAvailableDockPanelWidthPx(
    dockedPills.length,
    availableWidthPx,
  );
  if (availablePanelWidthPx <= 0) {
    return {};
  }
  const resolvedWidths = createResolvedDockWidths(
    dockedPills,
    desiredWidthsById,
  );
  const totalDesiredWidthPx = resolvedWidths.reduce(
    (sum, widthPx) => sum + widthPx,
    0,
  );
  if (totalDesiredWidthPx <= availablePanelWidthPx + DOCK_WIDTH_TOLERANCE_PX) {
    return mapDockWindowWidthsById(dockedPills, resolvedWidths);
  }
  const minTotalWidthPx = dockedPills.length * MIN_DOCK_CHAT_WIDTH_PX;
  if (minTotalWidthPx >= availablePanelWidthPx - DOCK_WIDTH_TOLERANCE_PX) {
    return mapDockWindowWidthsById(
      dockedPills,
      dockedPills.map(() => MIN_DOCK_CHAT_WIDTH_PX),
    );
  }
  return mapDockWindowWidthsById(
    dockedPills,
    shrinkDockWindowWidthsToFit(resolvedWidths, availablePanelWidthPx),
  );
}

export function resolveNextPillDisplayMode({
  currentMode,
  stripPillCount,
  viewportWidthPx,
  availableWidthPx,
  fullWidthPx,
  compactWidthPx,
}: {
  currentMode: PillDisplayMode;
  stripPillCount: number;
  viewportWidthPx: number;
  availableWidthPx: number;
  fullWidthPx: number;
  compactWidthPx: number;
}): PillDisplayMode {
  if (availableWidthPx <= 0) {
    return currentMode;
  }
  if (
    stripPillCount > 1 &&
    viewportWidthPx > 0 &&
    viewportWidthPx <= NARROW_CHAT_MENU_BREAKPOINT_PX
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
    CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 +
    COMPACT_PILL_WIDTH_PX * 2 +
    PILL_GAP_PX * 3;
  if (availableWidthPx <= minimumCycleWidthPx + 1) {
    return "menu";
  }
  return "cycle";
}
