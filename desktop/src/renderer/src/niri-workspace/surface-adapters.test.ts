import { describe, expect, test } from "vitest";

import {
  FakeCanvasSurfaceAdapter,
  FakeHeavyDomSurfaceAdapter,
  type FrameLoop,
} from "./surface-adapters";
import { createFakeHost } from "./test-dom-fakes";
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
