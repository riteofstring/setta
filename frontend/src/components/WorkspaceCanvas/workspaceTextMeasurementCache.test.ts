import { describe, expect, it } from "vitest";
import {
  beginWorkspaceTextMeasurementRequest,
  buildWorkspaceTextMeasurementCacheKey,
  completeWorkspaceTextMeasurementRequest,
  createWorkspaceTextMeasurementCacheState,
  measureWorkspaceTextPreview,
  resolveWorkspaceTextPreview,
  WORKSPACE_TEXT_STYLES,
} from "./workspaceTextMeasurementCache";

class MockMeasurementContext {
  font = "";

  measureText(text: string) {
    return { width: text.length * 8 } as TextMetrics;
  }
}

describe("workspace text measurement cache", () => {
  it("truncates measured text to the requested width", () => {
    const request = {
      cacheKey: "text-measure:test",
      text: "A very long setting label",
      font: WORKSPACE_TEXT_STYLES["dict-label"],
      maxWidth: 64,
    };

    const result = measureWorkspaceTextPreview(
      new MockMeasurementContext() as unknown as CanvasRenderingContext2D,
      request,
    );

    expect(result.truncated).toBe(true);
    expect(result.displayText).toMatch(/\.\.\.$/);
    expect(result.displayWidth).toBeLessThanOrEqual(request.maxWidth);
  });

  it("discards stale async measurement results by request id", () => {
    const cacheKey = buildWorkspaceTextMeasurementCacheKey({
      baseKey: "row:project:viewport:scroll:theme:font:dpr:measure:highlight",
      role: "dict-value",
      text: "hello world",
      font: WORKSPACE_TEXT_STYLES["dict-value"],
      maxWidth: 48,
    });
    const pending = beginWorkspaceTextMeasurementRequest(
      createWorkspaceTextMeasurementCacheState(),
      cacheKey,
      "request-1",
    );

    const stale = completeWorkspaceTextMeasurementRequest(
      pending,
      cacheKey,
      "request-old",
      {
        measuredWidth: 88,
        displayText: "stale",
        displayWidth: 40,
        truncated: true,
      },
    );
    const complete = completeWorkspaceTextMeasurementRequest(
      stale.cache,
      cacheKey,
      "request-1",
      {
        measuredWidth: 88,
        displayText: "hello...",
        displayWidth: 64,
        truncated: true,
      },
    );
    const preview = resolveWorkspaceTextPreview(complete.cache, {
      cacheKey,
      text: "hello world",
      font: WORKSPACE_TEXT_STYLES["dict-value"],
      maxWidth: 48,
    });

    expect(stale.applied).toBe(false);
    expect(complete.applied).toBe(true);
    expect(preview.ready).toBe(true);
    expect(preview.displayText).toBe("hello...");
  });
});
