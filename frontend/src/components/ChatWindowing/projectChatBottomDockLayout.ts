import { resolveDefaultDockedChatHeightPx } from "state/actions/projectChatWindowingDefaultBounds";
import type { ChatWindowBounds } from "utils/generatedTypes";

export const DOCK_SURFACE_MAX_WIDTH_PX = 1160;
export const DOCK_SURFACE_HORIZONTAL_MARGIN_PX = 20;
export const DOCK_WINDOW_DEFAULT_WIDTH_PX = 460;
export const DOCK_WINDOW_DEFAULT_HEIGHT_PX = 520;
export const MIN_DOCK_CHAT_WIDTH_PX = 280;
export const MIN_DOCK_CHAT_HEIGHT_PX = 220;

const DOCK_WINDOW_GAP_PX = 12;
const DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX = 4;
const COMPACT_PILL_WIDTH_PX = 28;
const CYCLE_CONTROL_BUTTON_WIDTH_PX = 24;
const PILL_GAP_PX = 4;
const MENU_MODE_TRIGGER_WIDTH_PX = 28;
const PERSISTENT_MANAGER_TRIGGER_RESERVED_WIDTH_PX =
  MENU_MODE_TRIGGER_WIDTH_PX + PILL_GAP_PX;
const MINIMIZED_PILL_STRIP_HORIZONTAL_PADDING_PX = 16;
const DOCKED_MINIMIZED_STRIP_RESERVED_WIDTH_PX =
  MINIMIZED_PILL_STRIP_HORIZONTAL_PADDING_PX +
  CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 +
  COMPACT_PILL_WIDTH_PX * 2 +
  PILL_GAP_PX * 3 +
  DOCK_WINDOW_GAP_PX;
const NARROW_CHAT_MENU_BREAKPOINT_PX = 520;

export type PillDisplayMode = "full" | "compact" | "cycle" | "menu";

type DockLayoutPill = {
  instanceId: string;
  dockPreferredWidthPx: number | null;
  bounds: Pick<ChatWindowBounds, "height">;
};

type ResolveDockedWindowLayoutArgs<TPill extends DockLayoutPill> = {
  dockedPills: TPill[];
  previewWidthsById: Record<string, number>;
  previewHeightsById: Record<string, number>;
  viewportWidthPx: number;
  viewportHeightPx: number;
  workspaceTopInsetPx: number;
  dockBottomOffsetPx: number;
  sideRailWidthPx: number;
  nonClosedChatCount: number;
  showManagerMenu: boolean;
  dockCycleOffsetFromEnd: number;
};

type DockedWindowLayout<TPill extends DockLayoutPill> = {
  dockAvailableHeightPx: number;
  dockStripReservedWidthPx: number;
  dockSurfaceAvailableWidthPx: number;
  resolvedDockWindowWidthsById: Record<string, number>;
  resolvedDockWindowHeightsById: Record<string, number>;
  maxVisibleDockedCount: number;
  maxDockCycleOffset: number;
  dockVisibleStartIndex: number;
  visibleDockedPills: TPill[];
  responsiveHiddenDockedIds: Set<string>;
  resolvedVisibleDockWindowWidthsById: Record<string, number>;
  dockSurfaceTargetWidthPx: number;
  dockSurfaceTargetHeightPx: number;
  dockSurfaceWidthCss: string;
  dockSurfaceHeightCss: string;
};

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
    if (minimumWidthPx <= availableWidthPx + 0.5) {
      return count;
    }
  }
  return 0;
}

export function resolveDockWindowWidthsToFit<TPill extends DockLayoutPill>(
  dockedPills: TPill[],
  desiredWidthsById: Record<string, number>,
  availableWidthPx: number,
): Record<string, number> {
  if (dockedPills.length === 0) {
    return {};
  }
  const gapWidthPx = Math.max(0, dockedPills.length - 1) * DOCK_WINDOW_GAP_PX;
  const availablePanelWidthPx =
    availableWidthPx - DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2 - gapWidthPx;
  if (availablePanelWidthPx <= 0) {
    return {};
  }

  const nextWidthsById: Record<string, number> = {};
  const resolvedWidths = dockedPills.map((pill) =>
    clampNumber(
      desiredWidthsById[pill.instanceId] ?? DOCK_WINDOW_DEFAULT_WIDTH_PX,
      MIN_DOCK_CHAT_WIDTH_PX,
      DOCK_SURFACE_MAX_WIDTH_PX,
    ),
  );
  const totalDesiredWidthPx = resolvedWidths.reduce(
    (sum, widthPx) => sum + widthPx,
    0,
  );

  if (totalDesiredWidthPx <= availablePanelWidthPx + 0.5) {
    dockedPills.forEach((pill, index) => {
      nextWidthsById[pill.instanceId] =
        resolvedWidths[index] ?? MIN_DOCK_CHAT_WIDTH_PX;
    });
    return nextWidthsById;
  }

  const minTotalWidthPx = dockedPills.length * MIN_DOCK_CHAT_WIDTH_PX;
  if (minTotalWidthPx >= availablePanelWidthPx - 0.5) {
    dockedPills.forEach((pill) => {
      nextWidthsById[pill.instanceId] = MIN_DOCK_CHAT_WIDTH_PX;
    });
    return nextWidthsById;
  }

  const shrinkableEntries = resolvedWidths.map((widthPx, index) => ({
    index,
    widthPx,
  }));
  let remainingReductionPx = totalDesiredWidthPx - availablePanelWidthPx;

  while (remainingReductionPx > 0.5) {
    const shrinkableIndices = shrinkableEntries
      .map((entry) => entry.index)
      .filter(
        (index) =>
          (shrinkableEntries[index]?.widthPx ?? MIN_DOCK_CHAT_WIDTH_PX) >
          MIN_DOCK_CHAT_WIDTH_PX + 0.5,
      );
    if (shrinkableIndices.length === 0) {
      break;
    }

    const totalShrinkCapacityPx = shrinkableIndices.reduce((sum, index) => {
      return (
        sum +
        ((shrinkableEntries[index]?.widthPx ?? MIN_DOCK_CHAT_WIDTH_PX) -
          MIN_DOCK_CHAT_WIDTH_PX)
      );
    }, 0);
    if (totalShrinkCapacityPx <= 0.5) {
      break;
    }

    let appliedReductionPx = 0;
    for (const index of shrinkableIndices) {
      const entry = shrinkableEntries[index];
      if (!entry) {
        continue;
      }
      const capacityPx = entry.widthPx - MIN_DOCK_CHAT_WIDTH_PX;
      const proportionalReductionPx =
        remainingReductionPx * (capacityPx / totalShrinkCapacityPx);
      const nextWidthPx = Math.max(
        MIN_DOCK_CHAT_WIDTH_PX,
        entry.widthPx - proportionalReductionPx,
      );
      appliedReductionPx += entry.widthPx - nextWidthPx;
      entry.widthPx = nextWidthPx;
    }

    if (appliedReductionPx <= 0.5) {
      break;
    }
    remainingReductionPx = Math.max(
      0,
      remainingReductionPx - appliedReductionPx,
    );
  }

  dockedPills.forEach((pill, index) => {
    nextWidthsById[pill.instanceId] =
      shrinkableEntries[index]?.widthPx ?? MIN_DOCK_CHAT_WIDTH_PX;
  });
  return nextWidthsById;
}

export function resolvePillDisplayMode({
  stripPillCount,
  availableWidthPx,
  fullWidthPx,
  compactWidthPx,
  viewportWidthPx,
}: {
  stripPillCount: number;
  availableWidthPx: number;
  fullWidthPx: number;
  compactWidthPx: number;
  viewportWidthPx: number;
}): PillDisplayMode {
  const minimumCycleWidthPx =
    CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 +
    COMPACT_PILL_WIDTH_PX * 2 +
    PILL_GAP_PX * 3;

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
  if (availableWidthPx <= minimumCycleWidthPx + 1) {
    return "menu";
  }
  return "cycle";
}

export function resolveCycleVisibleCount({
  pillDisplayMode,
  pillViewportWidthPx,
  stripPillCount,
}: {
  pillDisplayMode: PillDisplayMode;
  pillViewportWidthPx: number;
  stripPillCount: number;
}): number {
  if (stripPillCount === 0) {
    return 0;
  }
  if (pillDisplayMode !== "cycle") {
    return stripPillCount;
  }
  if (pillViewportWidthPx <= 0) {
    return 1;
  }
  const availablePillsWidthPx = Math.max(
    0,
    pillViewportWidthPx -
      CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 -
      PILL_GAP_PX * 2 -
      COMPACT_PILL_WIDTH_PX -
      PILL_GAP_PX,
  );
  const compactSlotWidthPx = COMPACT_PILL_WIDTH_PX + PILL_GAP_PX;
  const nextVisibleCount = Math.floor(
    (availablePillsWidthPx + PILL_GAP_PX) / compactSlotWidthPx,
  );
  return clampNumber(nextVisibleCount, 1, stripPillCount);
}

export function resolveDockedWindowLayout<TPill extends DockLayoutPill>({
  dockedPills,
  previewWidthsById,
  previewHeightsById,
  viewportWidthPx,
  viewportHeightPx,
  workspaceTopInsetPx,
  dockBottomOffsetPx,
  sideRailWidthPx,
  nonClosedChatCount,
  showManagerMenu,
  dockCycleOffsetFromEnd,
}: ResolveDockedWindowLayoutArgs<TPill>): DockedWindowLayout<TPill> {
  const dockAvailableHeightPx = Math.max(
    MIN_DOCK_CHAT_HEIGHT_PX,
    (viewportHeightPx > 0 ? viewportHeightPx : 900) -
      workspaceTopInsetPx -
      dockBottomOffsetPx,
  );
  const defaultDockWindowHeightPx = resolveDefaultDockedChatHeightPx({
    viewportHeightPx,
    workspaceTopInsetPx,
    bottomInsetPx: dockBottomOffsetPx,
    minHeightPx: MIN_DOCK_CHAT_HEIGHT_PX,
  });
  const dockStripReservedWidthPx = resolveDockStripReservedWidthPx({
    nonClosedChatCount,
    showManagerMenu,
  });
  const fallbackViewportWidth =
    DOCK_SURFACE_MAX_WIDTH_PX +
    (sideRailWidthPx + DOCK_SURFACE_HORIZONTAL_MARGIN_PX) * 2 +
    dockStripReservedWidthPx;
  const resolvedViewportWidth =
    viewportWidthPx > 0 ? viewportWidthPx : fallbackViewportWidth;
  const usableViewportWidthPx =
    resolvedViewportWidth -
    (sideRailWidthPx + DOCK_SURFACE_HORIZONTAL_MARGIN_PX) * 2 -
    dockStripReservedWidthPx;
  const dockSurfaceAvailableWidthPx = clampNumber(
    usableViewportWidthPx,
    0,
    DOCK_SURFACE_MAX_WIDTH_PX,
  );

  const resolvedDockWindowWidthsById: Record<string, number> = {};
  const resolvedDockWindowHeightsById: Record<string, number> = {};
  for (const pill of dockedPills) {
    const candidateWidthPx =
      typeof pill.dockPreferredWidthPx === "number" &&
      Number.isFinite(pill.dockPreferredWidthPx) &&
      pill.dockPreferredWidthPx > 0
        ? pill.dockPreferredWidthPx
        : DOCK_WINDOW_DEFAULT_WIDTH_PX;
    const previewWidthPx = previewWidthsById[pill.instanceId];
    resolvedDockWindowWidthsById[pill.instanceId] = clampNumber(
      typeof previewWidthPx === "number" ? previewWidthPx : candidateWidthPx,
      MIN_DOCK_CHAT_WIDTH_PX,
      DOCK_SURFACE_MAX_WIDTH_PX,
    );

    const candidateHeightPx =
      typeof pill.bounds.height === "number" &&
      Number.isFinite(pill.bounds.height) &&
      pill.bounds.height > 0
        ? pill.bounds.height
        : DOCK_WINDOW_DEFAULT_HEIGHT_PX;
    const shouldUseAutoFillHeight =
      Math.abs(candidateHeightPx - DOCK_WINDOW_DEFAULT_HEIGHT_PX) <= 0.5;
    const resolvedHeightPx = shouldUseAutoFillHeight
      ? defaultDockWindowHeightPx
      : candidateHeightPx;
    const previewHeightPx = previewHeightsById[pill.instanceId];
    resolvedDockWindowHeightsById[pill.instanceId] = clampNumber(
      typeof previewHeightPx === "number" ? previewHeightPx : resolvedHeightPx,
      MIN_DOCK_CHAT_HEIGHT_PX,
      dockAvailableHeightPx,
    );
  }

  const maxVisibleDockedCount = resolveMaxVisibleDockWindowCount(
    dockedPills.length,
    dockSurfaceAvailableWidthPx,
  );
  const maxDockCycleOffset = Math.max(
    0,
    dockedPills.length - maxVisibleDockedCount,
  );
  const dockVisibleStartIndex =
    maxVisibleDockedCount === 0
      ? dockedPills.length
      : Math.max(0, maxDockCycleOffset - dockCycleOffsetFromEnd);
  const visibleDockedPills =
    maxVisibleDockedCount === 0
      ? []
      : dockedPills.slice(
          dockVisibleStartIndex,
          dockVisibleStartIndex + maxVisibleDockedCount,
        );
  const visibleIds = new Set(visibleDockedPills.map((pill) => pill.instanceId));
  const responsiveHiddenDockedIds = new Set(
    dockedPills
      .filter((pill) => !visibleIds.has(pill.instanceId))
      .map((pill) => pill.instanceId),
  );
  const resolvedVisibleDockWindowWidthsById = resolveDockWindowWidthsToFit(
    visibleDockedPills,
    resolvedDockWindowWidthsById,
    dockSurfaceAvailableWidthPx,
  );

  let totalWindowWidthsPx = 0;
  for (const pill of visibleDockedPills) {
    totalWindowWidthsPx +=
      resolvedVisibleDockWindowWidthsById[pill.instanceId] ??
      DOCK_WINDOW_DEFAULT_WIDTH_PX;
  }
  const dockSurfaceTargetWidthPx = clampNumber(
    totalWindowWidthsPx +
      Math.max(0, visibleDockedPills.length - 1) * DOCK_WINDOW_GAP_PX +
      DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2,
    0,
    DOCK_SURFACE_MAX_WIDTH_PX,
  );

  let maxHeightPx = MIN_DOCK_CHAT_HEIGHT_PX;
  for (const pill of visibleDockedPills) {
    const nextHeightPx =
      resolvedDockWindowHeightsById[pill.instanceId] ??
      DOCK_WINDOW_DEFAULT_HEIGHT_PX;
    if (nextHeightPx > maxHeightPx) {
      maxHeightPx = nextHeightPx;
    }
  }
  const dockSurfaceTargetHeightPx = clampNumber(
    maxHeightPx,
    MIN_DOCK_CHAT_HEIGHT_PX,
    dockAvailableHeightPx,
  );

  const dockSurfaceWidthCss =
    dockSurfaceTargetWidthPx <= 0
      ? "0px"
      : `min(${dockSurfaceTargetWidthPx}px, ${DOCK_SURFACE_MAX_WIDTH_PX}px, calc(100vw - ${
          (sideRailWidthPx + DOCK_SURFACE_HORIZONTAL_MARGIN_PX) * 2 +
          dockStripReservedWidthPx
        }px))`;
  const dockSurfaceHeightCss = `min(${dockSurfaceTargetHeightPx}px, calc(100vh - ${
    workspaceTopInsetPx + dockBottomOffsetPx
  }px))`;

  return {
    dockAvailableHeightPx,
    dockStripReservedWidthPx,
    dockSurfaceAvailableWidthPx,
    resolvedDockWindowWidthsById,
    resolvedDockWindowHeightsById,
    maxVisibleDockedCount,
    maxDockCycleOffset,
    dockVisibleStartIndex,
    visibleDockedPills,
    responsiveHiddenDockedIds,
    resolvedVisibleDockWindowWidthsById,
    dockSurfaceTargetWidthPx,
    dockSurfaceTargetHeightPx,
    dockSurfaceWidthCss,
    dockSurfaceHeightCss,
  };
}
