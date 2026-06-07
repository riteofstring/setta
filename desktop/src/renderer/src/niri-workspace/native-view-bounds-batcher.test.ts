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

  test("does not send idle heartbeat batches after unchanged browser bounds", () => {
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
    batcher.queue(update("browser-surface-1", false));
    const result = batcher.flush();

    expect(result).toEqual({ batchSent: false, updateCount: 0 });
    expect(sent).toHaveLength(1);
  });

  test("hides stale live browser updates that are not present in the next frame", () => {
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

    expect(result).toEqual({ batchSent: true, updateCount: 1 });
    expect(sent.at(-1)?.visibleBrowserPanes).toBe(0);
    expect(sent.at(-1)?.updates).toMatchObject([
      {
        runtimeState: "hidden",
        surfaceId: "browser-surface-1",
        visible: false,
      },
    ]);
  });

  test("omits unchanged live browser updates when one surface hides", () => {
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
    batcher.flush();

    batcher.beginFrame();
    batcher.queue(update("browser-surface-2", false));
    batcher.queue(hiddenUpdate("browser-surface-1"));
    const result = batcher.flush();

    expect(result).toEqual({ batchSent: true, updateCount: 1 });
    expect(sent.at(-1)?.visibleBrowserPanes).toBe(1);
    expect(
      sent.at(-1)?.updates.map((candidate) => [candidate.surfaceId, candidate.visible]),
    ).toEqual([["browser-surface-1", false]]);
  });
});

function stats(): NiriBrowserViewStats {
  return {
    boundsBatchCount: 0,
    boundsUpdateCount: 0,
    contentLoaded: 0,
    destroyed: 0,
    focusedSurfaceId: null,
    hidden: 0,
    live: 0,
    loading: 0,
    registered: 0,
    snapshotCaptureLastError: null,
    snapshotCapturesFailed: 0,
    snapshotCapturesStarted: 0,
    snapshotCapturesSucceeded: 0,
    snapshotsInFlight: 0,
    teardownCount: 1,
    totalBrowserPanes: 24,
    visibleBrowserPanes: 0,
    workspaceId: null,
  };
}

function update(surfaceId: string, focused: boolean) {
  return {
    bounds: { height: 200, width: 300, x: 20, y: 30 },
    contentBounds: { height: 200, width: 300, x: 20, y: 30 },
    focused,
    paneId: `${surfaceId}-pane`,
    runtimeState: "live" as const,
    surfaceId,
    title: surfaceId,
    url: "data:text/html,ok",
    visible: true,
  };
}

function hiddenUpdate(surfaceId: string) {
  return {
    ...update(surfaceId, false),
    runtimeState: "hidden" as const,
    visible: false,
  };
}
