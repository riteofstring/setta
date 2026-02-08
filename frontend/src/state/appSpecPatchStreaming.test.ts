import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __getAppSpecPatchStreamCountForTests,
  __resetAppSpecPatchStreamsForTests,
  applyAppSpecPatchPreviewDelta,
  clearAllAppSpecPatchStreams,
  clearAppSpecPatchStream,
} from "./appSpecPatchStreaming";

describe("appSpecPatchStreaming", () => {
  beforeEach(() => {
    __resetAppSpecPatchStreamsForTests();
  });

  afterEach(() => {
    clearAllAppSpecPatchStreams();
    vi.useRealTimers();
  });

  it("applies patch lines and returns a new spec reference", () => {
    const spec = applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-1",
      previewValueDelta: '{"op":"set","path":"/root","value":"root"}\n',
    });

    expect(spec).not.toBeNull();
    expect(spec?.root).toBe("root");
  });

  it("clears streams by tool call id", () => {
    applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-1",
      previewValueDelta: '{"op":"set","path":"/root","value":"root"}\n',
    });
    expect(__getAppSpecPatchStreamCountForTests()).toBe(1);

    clearAppSpecPatchStream("tool-1");
    expect(__getAppSpecPatchStreamCountForTests()).toBe(0);
  });

  it("cleans up stale streams on new deltas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));

    applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-1",
      previewValueDelta: '{"op":"set","path":"/root","value":"a"}\n',
    });
    applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-2",
      previewValueDelta: '{"op":"set","path":"/root","value":"b"}\n',
    });
    expect(__getAppSpecPatchStreamCountForTests()).toBe(2);

    vi.setSystemTime(new Date("2025-01-01T00:10:00.001Z"));
    applyAppSpecPatchPreviewDelta({
      toolCallId: "tool-2",
      previewValueDelta: '{"op":"set","path":"/root","value":"c"}\n',
    });

    expect(__getAppSpecPatchStreamCountForTests()).toBe(1);
  });
});
