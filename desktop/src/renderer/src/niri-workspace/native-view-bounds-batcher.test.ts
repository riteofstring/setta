import { describe, expect, test, vi } from "vitest";

import type { NiriBrowserViewBatch, NiriBrowserViewStats } from "@shared/types";
import { NativeViewBoundsBatcher } from "./native-view-bounds-batcher";

describe("niri native view bounds batcher", () => {
  test("sends one native batch for multiple browser updates in a frame", () => {
    const sent: NiriBrowserViewBatch[] = [];
    const batcher = new NativeViewBoundsBatcher(
      {
        totalBrowserPanes: 24,
        workspaceId: "phase-4-browser-pane-benchmark",
      },
      {
        batchBrowserViewUpdates: (batch) => {
          sent.push(batch);
        },
        teardownBrowserViews: vi.fn(async () => stats()),
      },
    );

    batcher.beginFrame();
    batcher.queue(update("browser-surface-1", true));
    batcher.queue(update("browser-surface-2", false));
    const result = batcher.flush();

    expect(result).toEqual({ batchSent: true, updateCount: 2 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      focusedSurfaceId: "browser-surface-1",
      totalBrowserPanes: 24,
      visibleBrowserPanes: 2,
      workspaceId: "phase-4-browser-pane-benchmark",
    });
    expect(sent[0]?.updates.map((candidate) => candidate.surfaceId)).toEqual([
      "browser-surface-1",
      "browser-surface-2",
    ]);
  });

  test("sends an empty batch when previous browser views leave the visible frame", () => {
    const sent: NiriBrowserViewBatch[] = [];
    const batcher = new NativeViewBoundsBatcher(
      {
        totalBrowserPanes: 24,
        workspaceId: "phase-4-browser-pane-benchmark",
      },
      {
        batchBrowserViewUpdates: (batch) => {
          sent.push(batch);
        },
        teardownBrowserViews: vi.fn(async () => stats()),
      },
    );

    batcher.beginFrame();
    batcher.queue(update("browser-surface-1", false));
    batcher.flush();
    batcher.beginFrame();
    const result = batcher.flush();

    expect(result).toEqual({ batchSent: true, updateCount: 0 });
    expect(sent.at(-1)).toMatchObject({
      updates: [],
      visibleBrowserPanes: 0,
    });
  });
});

function stats(): NiriBrowserViewStats {
  return {
    boundsBatchCount: 0,
    boundsUpdateCount: 0,
    destroyed: 0,
    focusedSurfaceId: null,
    hidden: 0,
    live: 0,
    registered: 0,
    teardownCount: 1,
    totalBrowserPanes: 24,
    visibleBrowserPanes: 0,
    workspaceId: null,
  };
}

function update(surfaceId: string, focused: boolean) {
  return {
    bounds: { height: 200, width: 300, x: 20, y: 30 },
    focused,
    paneId: `${surfaceId}-pane`,
    runtimeState: "live" as const,
    surfaceId,
    title: surfaceId,
    url: "data:text/html,ok",
    visible: true,
  };
}
