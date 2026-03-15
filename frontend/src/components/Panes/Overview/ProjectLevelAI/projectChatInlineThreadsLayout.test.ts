import { describe, expect, it } from "vitest";
import {
  PROJECT_CHAT_INLINE_THREADS_BREAKPOINT_PX,
  PROJECT_CHAT_INLINE_THREADS_DEFAULT_WIDTH_PX,
  PROJECT_CHAT_INLINE_THREADS_MAX_WIDTH_PX,
  PROJECT_CHAT_INLINE_THREADS_MIN_WIDTH_PX,
  isProjectChatLargeEnoughForInlineThreads,
  readProjectChatInlineThreadsStoredWidth,
  resolveProjectChatInlineThreadsMaxWidth,
  resolveProjectChatInlineThreadsWidth,
} from "./projectChatInlineThreadsLayout";

describe("isProjectChatLargeEnoughForInlineThreads", () => {
  it("uses the inline-threads breakpoint as the visibility threshold", () => {
    expect(
      isProjectChatLargeEnoughForInlineThreads(
        PROJECT_CHAT_INLINE_THREADS_BREAKPOINT_PX - 1,
      ),
    ).toBe(false);
    expect(
      isProjectChatLargeEnoughForInlineThreads(
        PROJECT_CHAT_INLINE_THREADS_BREAKPOINT_PX,
      ),
    ).toBe(true);
  });
});

describe("resolveProjectChatInlineThreadsMaxWidth", () => {
  it("clamps the resizable max width between the configured min and max", () => {
    expect(resolveProjectChatInlineThreadsMaxWidth(500)).toBe(
      PROJECT_CHAT_INLINE_THREADS_MIN_WIDTH_PX,
    );
    expect(resolveProjectChatInlineThreadsMaxWidth(860)).toBe(440);
    expect(resolveProjectChatInlineThreadsMaxWidth(1200)).toBe(
      PROJECT_CHAT_INLINE_THREADS_MAX_WIDTH_PX,
    );
  });
});

describe("resolveProjectChatInlineThreadsWidth", () => {
  it("keeps requested widths inside the allowed bounds for the viewport", () => {
    expect(
      resolveProjectChatInlineThreadsWidth({
        requestedWidth: 180,
        viewportWidth: 860,
      }),
    ).toBe(PROJECT_CHAT_INLINE_THREADS_MIN_WIDTH_PX);
    expect(
      resolveProjectChatInlineThreadsWidth({
        requestedWidth: 480,
        viewportWidth: 860,
      }),
    ).toBe(440);
    expect(
      resolveProjectChatInlineThreadsWidth({
        requestedWidth: 300,
        viewportWidth: 1200,
      }),
    ).toBe(300);
  });
});

describe("readProjectChatInlineThreadsStoredWidth", () => {
  it("falls back to the default width when persisted storage is invalid", () => {
    expect(readProjectChatInlineThreadsStoredWidth(Number.NaN)).toBe(
      PROJECT_CHAT_INLINE_THREADS_DEFAULT_WIDTH_PX,
    );
    expect(
      readProjectChatInlineThreadsStoredWidth(Number.POSITIVE_INFINITY),
    ).toBe(PROJECT_CHAT_INLINE_THREADS_DEFAULT_WIDTH_PX);
  });

  it("keeps finite persisted widths for later viewport-specific clamping", () => {
    expect(readProjectChatInlineThreadsStoredWidth(360)).toBe(360);
  });
});
