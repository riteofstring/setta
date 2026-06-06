import { describe, expect, test } from "vitest";

import type { NiriBrowserViewUpdate } from "@shared/types";
import { BrowserSurfaceProxyAdapter } from "./browser-surface-proxy-adapter";
import {
  buildGitGraphBatch,
  selectGitGraphRenderer,
  type GitGraphLayoutRequest,
} from "./git-graph-layout";
import {
  GitGraphSurfaceAdapter,
  type GitGraphWorkerCallbacks,
  type GitGraphWorkerClient,
} from "./git-graph-surface-adapter";
import {
  FakeCanvasSurfaceAdapter,
  FakeHeavyDomSurfaceAdapter,
  type FrameLoop,
  PixiCanvasSurfaceAdapter,
} from "./surface-adapters";
import { TerminalSessionState, TerminalSurfaceAdapter } from "./terminal-surface-adapter";
import { createFakeHost, setFakeRect } from "./test-dom-fakes";
import type { NiriPane } from "./types";

describe("niri fake surface adapters", () => {
  test("tracks fake heavy DOM freeze and resume lifecycle on the host", () => {
    const host = createFakeHost();
    const adapter = new FakeHeavyDomSurfaceAdapter(fakePane("fake-heavy-dom"));

    adapter.mount(host);
    adapter.setVisible(true);
    adapter.freeze("snapshot");

    expect(host.dataset.surfaceKind).toBe("fake-heavy-dom");
    expect(host.dataset.surfaceVisible).toBe("true");
    expect(host.dataset.surfaceFrozen).toBe("true");

    adapter.resume("visible");

    expect(host.dataset.surfaceFrozen).toBe("false");
    expect(adapter.lifecycleState).toMatchObject({
      frozen: false,
      mounted: true,
      visible: true,
    });
  });

  test("pauses fake canvas frame work when hidden, frozen, or unmounted", () => {
    const loop = new ManualFrameLoop();
    const host = createFakeHost();
    const adapter = new FakeCanvasSurfaceAdapter(fakePane("fake-canvas"), loop);

    adapter.mount(host);
    adapter.setViewport({ height: 120, width: 180, x: 0, y: 0 }, "mount");
    adapter.setVisible(true);

    expect(adapter.isRendering).toBe(true);
    expect(loop.pendingCount).toBe(1);

    loop.runNext();

    expect(adapter.renderedFrameCount).toBe(1);
    expect(loop.pendingCount).toBe(1);

    adapter.setVisible(false);
    loop.runAll();

    expect(adapter.isRendering).toBe(false);
    expect(adapter.renderedFrameCount).toBe(1);

    adapter.setVisible(true);
    adapter.freeze("snapshot");
    loop.runAll();

    expect(adapter.isRendering).toBe(false);
    expect(adapter.renderedFrameCount).toBe(1);

    adapter.resume("visible");
    loop.runNext();

    expect(adapter.renderedFrameCount).toBe(2);

    adapter.unmount();

    expect(adapter.isRendering).toBe(false);
    expect(loop.pendingCount).toBe(0);
  });

  test("keeps Pixi canvas rendering paused when hidden, frozen, or unmounted", () => {
    const loop = new ManualFrameLoop();
    const host = createFakeHost();
    const adapter = new PixiCanvasSurfaceAdapter(fakePane("pixi-canvas"), loop);

    adapter.mount(host);
    adapter.setViewport({ height: 120, width: 180, x: 0, y: 0 }, "mount");
    adapter.setVisible(true);

    expect(adapter.isRendering).toBe(true);
    expect(loop.pendingCount).toBe(1);

    loop.runNext();

    expect(adapter.getCanvasStats()).toMatchObject({
      drawCalls: 8,
      liveCanvasPaneCount: 1,
      renderedFrames: 1,
    });
    expect(loop.pendingCount).toBe(0);

    adapter.setVisible(false);
    loop.runAll();

    expect(adapter.isRendering).toBe(false);
    expect(adapter.getCanvasStats().liveCanvasPaneCount).toBe(0);

    adapter.setVisible(true);
    adapter.freeze("snapshot");
    loop.runAll();

    expect(adapter.isRendering).toBe(false);
    expect(adapter.getCanvasStats().drawCalls).toBe(0);

    adapter.resume("visible");
    loop.runNext();

    expect(adapter.getCanvasStats()).toMatchObject({
      drawCalls: 8,
      liveCanvasPaneCount: 1,
      renderedFrames: 2,
    });

    adapter.unmount();

    expect(adapter.isRendering).toBe(false);
    expect(loop.pendingCount).toBe(0);
  });

  test("reports simplified Pixi canvas stats after far zoom", () => {
    const loop = new ManualFrameLoop();
    const host = createFakeHost();
    const adapter = new PixiCanvasSurfaceAdapter(fakePane("pixi-canvas"), loop);

    adapter.mount(host);
    adapter.setViewport({ height: 120, width: 180, x: 0, y: 0 }, "mount");
    adapter.setVisible(true);
    loop.runNext();

    for (let index = 0; index < 12; index += 1) {
      host.dispatchEvent(fakeWheelEvent(100));
    }
    loop.runNext();

    expect(adapter.getCanvasStats()).toMatchObject({
      drawCalls: 3,
      farZoomSimplified: true,
      liveCanvasPaneCount: 1,
    });
    expect(Number(host.dataset.canvasZoom)).toBeLessThan(0.35);
    expect(adapter.getCanvasStats().gpuMemoryEstimateBytes).toBeGreaterThan(0);
  });

  test("clips browser native bounds to the stage viewport", () => {
    const sent: NiriBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 90 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 160, width: 200, x: 220, y: 70 });
    adapter.setViewport({ height: 160, width: 200, x: -80, y: -20 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 140, width: 110, x: 300, y: 90 },
      visible: true,
    });
  });

  test("positions browser native bounds from the actual pane host below shell chrome", () => {
    const sent: NiriBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 40 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 160, width: 200, x: 380, y: 78 });
    adapter.setViewport({ height: 160, width: 200, x: 80, y: 0 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 160, width: 190, x: 380, y: 78 },
      visible: true,
    });
  });

  test("keeps unfocused browser native views hidden behind the DOM proxy", () => {
    const sent: NiriBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 90 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    setFakeRect(host, { height: 160, width: 200, x: 380, y: 110 });
    adapter.setViewport({ height: 160, width: 200, x: 80, y: 20 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 160, width: 190, x: 380, y: 110 },
      visible: false,
    });

    adapter.setFocused(true);

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 160, width: 190, x: 380, y: 110 },
      visible: true,
    });
  });

  test("hides browser native views during active resize", () => {
    const sent: NiriBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 90 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 160, width: 200, x: 380, y: 110 });
    adapter.setViewport({ height: 160, width: 200, x: 80, y: 20 }, "frame");
    setFakeRect(host, { height: 160, width: 200, x: 400, y: 120 });
    adapter.setViewport({ height: 160, width: 200, x: 100, y: 30 }, "resize-active");
    setFakeRect(host, { height: 160, width: 200, x: 420, y: 130 });
    adapter.setViewport({ height: 160, width: 200, x: 120, y: 40 }, "resize");

    expect(sent.at(-3)).toMatchObject({ visible: true });
    expect(sent.at(-2)).toMatchObject({ visible: false });
    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 160, width: 190, x: 420, y: 130 },
      visible: true,
    });
  });

  test("hides mostly clipped browser native views at the stage boundary", () => {
    const sent: NiriBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 90 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 160, width: 200, x: 180, y: 70 });
    adapter.setViewport({ height: 160, width: 200, x: -120, y: -20 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 1, width: 1, x: 300, y: 90 },
      visible: false,
    });
  });

  test("hides fully clipped browser native views at the stage boundary", () => {
    const sent: NiriBrowserViewUpdate[] = [];
    const host = createFakeHost();
    mountBrowserStage(host, { height: 360, width: 500, x: 300, y: 90 });
    const adapter = new BrowserSurfaceProxyAdapter(fakePane("browser"), {
      queue(update) {
        sent.push(update);
      },
    });

    adapter.mount(host);
    adapter.resume("visible");
    adapter.setVisible(true);
    adapter.setFocused(true);
    setFakeRect(host, { height: 120, width: 100, x: 40, y: 110 });
    adapter.setViewport({ height: 120, width: 100, x: -260, y: 20 }, "frame");

    expect(sent.at(-1)).toMatchObject({
      bounds: { height: 1, width: 1, x: 300, y: 110 },
      visible: false,
    });
  });

  test("drains terminal output floods with bounded dirty-row rendering", () => {
    const loop = new ManualFrameLoop();
    const host = createFakeHost();
    const session = new TerminalSessionState("test-terminal-session");
    const adapter = new TerminalSurfaceAdapter(fakePane("terminal"), session, loop);

    adapter.mount(host);
    adapter.setViewport({ height: 220, width: 280, x: 0, y: 0 }, "mount");
    adapter.setVisible(true);
    adapter.enqueueOutputFlood(1200);

    expect(loop.pendingCount).toBe(1);

    loop.runNext();

    expect(adapter.getTerminalStats()).toMatchObject({
      liveTerminalRendererCount: 1,
      renderedRows: 10,
    });
    expect(adapter.getTerminalStats().dirtyRows).toBeLessThanOrEqual(32);
    expect(adapter.getTerminalStats().droppedOutputChunks).toBeGreaterThan(0);
    expect(adapter.getTerminalStats().pendingOutputChunks).toBeGreaterThan(0);
    expect(session.scrollbackRowCount).toBeLessThan(1200);

    adapter.freeze("snapshot");
    loop.runAll();

    expect(adapter.isRendering).toBe(false);
    expect(session.pendingChunkCount).toBeGreaterThan(0);
  });

  test("renders git graph worker batches progressively and selects renderer by scale", () => {
    const loop = new ManualFrameLoop();
    const worker = new ManualGitGraphWorkerClient();
    const host = createFakeHost();
    const adapter = new GitGraphSurfaceAdapter(fakePane("git-graph"), () => worker, loop);

    adapter.mount(host);
    adapter.setViewport({ height: 240, width: 320, x: 0, y: 0 }, "mount");
    adapter.setVisible(true);

    expect(worker.requestCount).toBe(1);

    worker.emitNextBatch();
    loop.runNext();

    expect(adapter.getGitGraphStats()).toMatchObject({
      liveGraphPaneCount: 1,
      renderedNodes: 120,
      renderer: "canvas",
      workerBatches: 1,
      workerPending: true,
    });
    expect(adapter.getGitGraphStats().progress).toBeGreaterThan(0);

    worker.complete();
    loop.runNext();

    expect(adapter.getGitGraphStats()).toMatchObject({
      completed: true,
      workerPending: false,
    });
    expect(selectGitGraphRenderer({ nodeCount: 40, scale: 1 })).toBe("dom");
    expect(selectGitGraphRenderer({ nodeCount: 400, scale: 0.5 })).toBe("svg");
    expect(selectGitGraphRenderer({ nodeCount: 1800, scale: 0.34 })).toBe("canvas");
  });
});

class ManualFrameLoop implements FrameLoop {
  private callbacks = new Map<number, FrameRequestCallback>();
  private nextHandle = 1;

  get pendingCount(): number {
    return this.callbacks.size;
  }

  cancelFrame(handle: number): void {
    this.callbacks.delete(handle);
  }

  requestFrame(callback: FrameRequestCallback): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  runAll(): void {
    while (this.callbacks.size > 0) {
      this.runNext();
    }
  }

  runNext(): void {
    const next = this.callbacks.entries().next().value;
    if (!next) {
      return;
    }
    const [handle, callback] = next;
    this.callbacks.delete(handle);
    callback(0);
  }
}

class ManualGitGraphWorkerClient implements GitGraphWorkerClient {
  private callbacks: GitGraphWorkerCallbacks | null = null;
  private startIndex = 0;

  requestCount = 0;

  destroy(): void {
    this.callbacks = null;
  }

  requestLayout(
    _request: GitGraphLayoutRequest,
    callbacks: GitGraphWorkerCallbacks,
  ): { cancel(): void } {
    this.callbacks = callbacks;
    this.requestCount += 1;
    return {
      cancel: () => {
        this.callbacks = null;
      },
    };
  }

  complete(): void {
    while (this.startIndex < 1800) {
      this.emitNextBatch();
    }
    this.callbacks?.onComplete();
  }

  emitNextBatch(): void {
    const batch = buildGitGraphBatch(
      {
        batchSize: 120,
        laneCount: 7,
        nodeCount: 1800,
      },
      this.startIndex,
    );
    this.startIndex = batch.processedNodeCount;
    this.callbacks?.onBatch(batch);
  }
}

function fakeWheelEvent(deltaY: number): Event {
  const event = {
    defaultPrevented: false,
    deltaY,
    preventDefault() {
      event.defaultPrevented = true;
    },
    type: "wheel",
  };
  return event as unknown as Event;
}

function mountBrowserStage(
  host: HTMLElement,
  rect: { height: number; width: number; x: number; y: number },
): HTMLElement {
  const stage = host.ownerDocument.createElement("div");
  stage.dataset.testid = "niri-presentation-engine";
  setFakeRect(stage, rect);
  stage.append(host);
  return stage as unknown as HTMLElement;
}

function fakePane(surfaceKind: NiriPane["surfaceKind"]): NiriPane {
  return {
    columnId: "column",
    heat: 42,
    paneId: "pane",
    sequence: 0,
    subtitle: "test",
    surfaceId: "surface",
    surfaceKind,
    title: "Pane",
    tone: "cyan",
    weight: 1,
  };
}
