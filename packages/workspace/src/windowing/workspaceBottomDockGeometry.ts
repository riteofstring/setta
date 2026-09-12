import type {
  WorkspaceFloatingWindow,
  WorkspaceWindowBoundaryInsets,
  WorkspaceWindowViewport,
} from "./windowingTypes";
import {
  resolveWorkspaceBottomDockStripReservedWidthPx,
  resolveWorkspaceMaxVisibleBottomDockWindowCount,
  WORKSPACE_BOTTOM_DOCK_SURFACE_MAX_WIDTH_PX,
} from "./workspaceBottomDockLayout";

const WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_HEIGHT_PX = 220;

const EMPTY_INSETS: WorkspaceWindowBoundaryInsets = Object.freeze({
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function resolveWorkspaceBottomDockViewport(
  viewport: WorkspaceWindowViewport | null,
) {
  const insets = viewport?.insets ?? EMPTY_INSETS;
  const viewportWidth = viewport?.width ?? 0;
  const viewportHeight =
    viewport?.height ?? WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_HEIGHT_PX;
  return {
    insets,
    usableHeight: Math.max(
      WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_HEIGHT_PX,
      viewportHeight - insets.top - insets.bottom,
    ),
    viewportWidth,
    workWidth: Math.max(0, viewportWidth - insets.left - insets.right),
  };
}

export function resolveWorkspaceBottomDockVisibility({
  dockCycleOffsetFromEnd,
  nonClosedWindowCount,
  openDockedWindows,
  showManager,
  workWidth,
}: {
  readonly dockCycleOffsetFromEnd: number;
  readonly nonClosedWindowCount: number;
  readonly openDockedWindows: readonly WorkspaceFloatingWindow[];
  readonly showManager: boolean;
  readonly workWidth: number;
}) {
  const reservedWidth = resolveWorkspaceBottomDockStripReservedWidthPx({
    nonClosedWindowCount,
    showManagerMenu: showManager,
  });
  const dockAvailableWidth = clamp(
    workWidth - reservedWidth,
    0,
    WORKSPACE_BOTTOM_DOCK_SURFACE_MAX_WIDTH_PX,
  );
  const maxVisibleDockedCount = resolveWorkspaceMaxVisibleBottomDockWindowCount(
    openDockedWindows.length,
    dockAvailableWidth,
  );
  const maxDockCycleOffset = Math.max(
    0,
    openDockedWindows.length - maxVisibleDockedCount,
  );
  const visibleDockedStartIndex = getVisibleDockedStartIndex({
    dockCycleOffsetFromEnd,
    maxDockCycleOffset,
    maxVisibleDockedCount,
    openDockedWindowCount: openDockedWindows.length,
  });
  return {
    dockAvailableWidth,
    maxDockCycleOffset,
    maxVisibleDockedCount,
    visibleDockedStartIndex,
    visibleDockedWindows: getVisibleDockedWindows(
      openDockedWindows,
      visibleDockedStartIndex,
      maxVisibleDockedCount,
    ),
  };
}

function getVisibleDockedStartIndex({
  dockCycleOffsetFromEnd,
  maxDockCycleOffset,
  maxVisibleDockedCount,
  openDockedWindowCount,
}: {
  readonly dockCycleOffsetFromEnd: number;
  readonly maxDockCycleOffset: number;
  readonly maxVisibleDockedCount: number;
  readonly openDockedWindowCount: number;
}): number {
  if (maxVisibleDockedCount === 0) return openDockedWindowCount;
  return Math.max(0, maxDockCycleOffset - dockCycleOffsetFromEnd);
}

function getVisibleDockedWindows(
  openDockedWindows: readonly WorkspaceFloatingWindow[],
  startIndex: number,
  count: number,
): readonly WorkspaceFloatingWindow[] {
  if (count === 0) return [];
  return openDockedWindows.slice(startIndex, startIndex + count);
}
