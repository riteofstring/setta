import { clamp } from "utils/utils";

export const PROJECT_CHAT_INLINE_THREADS_BREAKPOINT_PX = 760;
export const PROJECT_CHAT_INLINE_THREADS_MIN_WIDTH_PX = 220;
export const PROJECT_CHAT_INLINE_THREADS_DEFAULT_WIDTH_PX = 288;
export const PROJECT_CHAT_INLINE_THREADS_MAX_WIDTH_PX = 520;
export const PROJECT_CHAT_INLINE_THREADS_MIN_CHAT_WIDTH_PX = 420;
export const PROJECT_CHAT_INLINE_THREADS_WIDTH_STORAGE_KEY =
  "setta_project_ai_inline_threads_width";

export type ResolveProjectChatThreadVisibilityFromResizeInput = {
  isInitialRun: boolean;
  wasLargeEnoughForInlineThreads: boolean;
  isLargeEnoughForInlineThreads: boolean;
  viewThreads: boolean;
  explicitlyClosedAtLargeWidth: boolean;
};

export function isProjectChatLargeEnoughForInlineThreads(
  viewportWidth: number,
): boolean {
  return viewportWidth >= PROJECT_CHAT_INLINE_THREADS_BREAKPOINT_PX;
}

export function resolveProjectChatThreadVisibilityFromResize({
  isInitialRun,
  wasLargeEnoughForInlineThreads,
  isLargeEnoughForInlineThreads,
  viewThreads,
  explicitlyClosedAtLargeWidth,
}: ResolveProjectChatThreadVisibilityFromResizeInput): boolean | null {
  if (isInitialRun) {
    if (!isLargeEnoughForInlineThreads) {
      if (!viewThreads) {
        return null;
      }
      return false;
    }
    if (viewThreads || explicitlyClosedAtLargeWidth) {
      return null;
    }
    return true;
  }
  if (wasLargeEnoughForInlineThreads === isLargeEnoughForInlineThreads) {
    return null;
  }
  if (!isLargeEnoughForInlineThreads) {
    if (!viewThreads) {
      return null;
    }
    return false;
  }
  if (viewThreads || explicitlyClosedAtLargeWidth) {
    return null;
  }
  return true;
}

export function resolveProjectChatInlineThreadsMaxWidth(
  viewportWidth: number,
): number {
  return clamp(
    viewportWidth - PROJECT_CHAT_INLINE_THREADS_MIN_CHAT_WIDTH_PX,
    PROJECT_CHAT_INLINE_THREADS_MIN_WIDTH_PX,
    PROJECT_CHAT_INLINE_THREADS_MAX_WIDTH_PX,
  );
}

export function resolveProjectChatInlineThreadsWidth({
  requestedWidth,
  viewportWidth,
}: {
  requestedWidth: number;
  viewportWidth: number;
}): number {
  return clamp(
    requestedWidth,
    PROJECT_CHAT_INLINE_THREADS_MIN_WIDTH_PX,
    resolveProjectChatInlineThreadsMaxWidth(viewportWidth),
  );
}

export function readProjectChatInlineThreadsStoredWidth(
  rawStoredWidth: number,
): number {
  if (!Number.isFinite(rawStoredWidth)) {
    return PROJECT_CHAT_INLINE_THREADS_DEFAULT_WIDTH_PX;
  }
  return rawStoredWidth;
}
