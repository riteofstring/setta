import { useProjectState } from "state/definitions";
import type { FloatingWindowBoundaryInsets } from "./projectChatSnapLayout";

export const PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX = 1440;
export const PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX = 900;
export const PROJECT_CHAT_SIDE_RAIL_WIDTH_PX = 40;
export const PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX = 40;
export const PROJECT_CHAT_VIEW_MODE_TABS_HEIGHT_PX = 36;
export const PROJECT_CHAT_WORKSPACE_SELECTOR = ".canvas-flow";

type ProjectChatFloatingViewport = {
  viewportWidthPx: number;
  viewportHeightPx: number;
  insets: FloatingWindowBoundaryInsets;
};

function hasProjectViewModeTabs(
  viewModes: Record<string, { isTab?: boolean }>,
): boolean {
  return Object.values(viewModes).some((viewMode) => viewMode.isTab);
}

export function resolveProjectChatFloatingWorkspaceTopInsetPx(): number {
  if (typeof document === "undefined") {
    return PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX;
  }
  const workspace = document.querySelector(PROJECT_CHAT_WORKSPACE_SELECTOR);
  if (!(workspace instanceof HTMLElement)) {
    return PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX;
  }
  const topInsetPx = workspace.getBoundingClientRect().top;
  if (!Number.isFinite(topInsetPx) || topInsetPx <= 0) {
    return PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX;
  }
  return topInsetPx;
}

export function resolveProjectChatFloatingBottomInsetPx(): number {
  const viewModes = useProjectState.getState().projectConfig.viewModes;
  return hasProjectViewModeTabs(viewModes)
    ? PROJECT_CHAT_VIEW_MODE_TABS_HEIGHT_PX
    : 0;
}

export function resolveProjectChatFloatingBoundaryInsets(
  workspaceTopInsetPx: number = resolveProjectChatFloatingWorkspaceTopInsetPx(),
  bottomInsetPx: number = resolveProjectChatFloatingBottomInsetPx(),
): FloatingWindowBoundaryInsets {
  return {
    left: PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
    right: PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
    top: workspaceTopInsetPx,
    bottom: bottomInsetPx,
  };
}

export function resolveProjectChatFloatingViewport(): ProjectChatFloatingViewport {
  return {
    viewportWidthPx:
      typeof window === "undefined"
        ? PROJECT_CHAT_FALLBACK_VIEWPORT_WIDTH_PX
        : window.innerWidth,
    viewportHeightPx:
      typeof window === "undefined"
        ? PROJECT_CHAT_FALLBACK_VIEWPORT_HEIGHT_PX
        : window.innerHeight,
    insets: resolveProjectChatFloatingBoundaryInsets(),
  };
}
