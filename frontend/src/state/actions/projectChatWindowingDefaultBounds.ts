import {
  PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX,
  PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX,
  PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX,
  PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
} from "components/ChatWindowing/projectChatViewport";
import type { ChatWindowBounds } from "utils/generatedTypes";

type DefaultFloatingChatBoundsOptions = {
  viewportWidthPx: number;
  viewportHeightPx: number;
  workspaceTopInsetPx: number;
  bottomInsetPx: number;
  widthPx?: number;
  heightViewportFraction?: number;
  sideRailWidthPx?: number;
  minWidthPx?: number;
  minHeightPx?: number;
};

type DefaultDockedChatHeightOptions = {
  viewportHeightPx: number;
  workspaceTopInsetPx: number;
  bottomInsetPx: number;
  heightViewportFraction?: number;
  minHeightPx?: number;
};

const DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_WIDTH_PX =
  PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX;
const DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX =
  PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX;
const DEFAULT_FLOATING_CHAT_WIDTH_PX = 820;
const DEFAULT_FLOATING_CHAT_HEIGHT_VIEWPORT_FRACTION = 0.7;
const DEFAULT_FLOATING_CHAT_SIDE_RAIL_WIDTH_PX =
  PROJECT_CHAT_SIDE_RAIL_WIDTH_PX;
const DEFAULT_FLOATING_CHAT_WORKSPACE_TOP_INSET_PX =
  PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX;
const DEFAULT_FLOATING_CHAT_MIN_WIDTH_PX = 380;
const DEFAULT_FLOATING_CHAT_MIN_HEIGHT_PX = 240;
const DEFAULT_DOCKED_CHAT_HEIGHT_VIEWPORT_FRACTION = 0.7;
const DEFAULT_DOCKED_CHAT_MIN_HEIGHT_PX = 220;

export function resolveDefaultFloatingChatBounds({
  viewportWidthPx,
  viewportHeightPx,
  workspaceTopInsetPx,
  bottomInsetPx,
  widthPx = DEFAULT_FLOATING_CHAT_WIDTH_PX,
  heightViewportFraction = DEFAULT_FLOATING_CHAT_HEIGHT_VIEWPORT_FRACTION,
  sideRailWidthPx = DEFAULT_FLOATING_CHAT_SIDE_RAIL_WIDTH_PX,
  minWidthPx = DEFAULT_FLOATING_CHAT_MIN_WIDTH_PX,
  minHeightPx = DEFAULT_FLOATING_CHAT_MIN_HEIGHT_PX,
}: DefaultFloatingChatBoundsOptions): ChatWindowBounds {
  const safeViewportWidthPx =
    Number.isFinite(viewportWidthPx) && viewportWidthPx > 0
      ? viewportWidthPx
      : DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_WIDTH_PX;
  const safeViewportHeightPx =
    Number.isFinite(viewportHeightPx) && viewportHeightPx > 0
      ? viewportHeightPx
      : DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX;
  const safeWorkspaceTopInsetPx =
    Number.isFinite(workspaceTopInsetPx) && workspaceTopInsetPx >= 0
      ? workspaceTopInsetPx
      : DEFAULT_FLOATING_CHAT_WORKSPACE_TOP_INSET_PX;
  const safeBottomInsetPx =
    Number.isFinite(bottomInsetPx) && bottomInsetPx >= 0 ? bottomInsetPx : 0;
  const availableWidthPx = Math.max(
    minWidthPx,
    safeViewportWidthPx - sideRailWidthPx * 2,
  );
  const availableHeightPx = Math.max(
    minHeightPx,
    safeViewportHeightPx - safeWorkspaceTopInsetPx - safeBottomInsetPx,
  );
  const resolvedWidthPx = Math.min(
    Math.max(minWidthPx, widthPx),
    availableWidthPx,
  );
  const desiredHeightPx = safeViewportHeightPx * heightViewportFraction;
  const resolvedHeightPx = Math.min(
    Math.max(minHeightPx, desiredHeightPx),
    availableHeightPx,
  );

  return {
    x:
      sideRailWidthPx +
      Math.max(0, Math.round((availableWidthPx - resolvedWidthPx) / 2)),
    y:
      safeWorkspaceTopInsetPx +
      Math.max(0, Math.round((availableHeightPx - resolvedHeightPx) / 2)),
    width: resolvedWidthPx,
    height: resolvedHeightPx,
  };
}

export function resolveDefaultDockedChatHeightPx({
  viewportHeightPx,
  workspaceTopInsetPx,
  bottomInsetPx,
  heightViewportFraction = DEFAULT_DOCKED_CHAT_HEIGHT_VIEWPORT_FRACTION,
  minHeightPx = DEFAULT_DOCKED_CHAT_MIN_HEIGHT_PX,
}: DefaultDockedChatHeightOptions): number {
  const safeViewportHeightPx =
    Number.isFinite(viewportHeightPx) && viewportHeightPx > 0
      ? viewportHeightPx
      : DEFAULT_FLOATING_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX;
  const safeWorkspaceTopInsetPx =
    Number.isFinite(workspaceTopInsetPx) && workspaceTopInsetPx >= 0
      ? workspaceTopInsetPx
      : DEFAULT_FLOATING_CHAT_WORKSPACE_TOP_INSET_PX;
  const safeBottomInsetPx =
    Number.isFinite(bottomInsetPx) && bottomInsetPx >= 0 ? bottomInsetPx : 0;
  const availableHeightPx = Math.max(
    minHeightPx,
    safeViewportHeightPx - safeWorkspaceTopInsetPx - safeBottomInsetPx,
  );
  return Math.min(
    Math.max(minHeightPx, safeViewportHeightPx * heightViewportFraction),
    availableHeightPx,
  );
}
