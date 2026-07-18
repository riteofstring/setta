import type { IpcMainEvent, Rectangle } from "electron";
import { describe, expect, test, vi } from "vitest";

import { ipcEvents } from "@shared/ipc";
import type { WorkspaceBrowserViewBatch } from "@shared/types";
import { WebContentsViewRegistry } from "./workspace-browser-views";

describe("workspace WebContentsView registry", () => {
  test("creates browser views, applies changed bounds, and routes changed focus once", () => {
    const owner = new FakeOwnerWindow();
    const views: FakeNativeView[] = [];
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => {
        const view = new FakeNativeView();
        views.push(view);
        return view as never;
      },
      windowFromIpcEvent: () => owner as never,
    });

    const firstStats = registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    const secondStats = registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));

    expect(owner.contentView.children).toHaveLength(1);
    expect(owner.contentView.children[0]?.children).toEqual([views[0]]);
    expect(owner.contentView.children[0]?.bounds).toEqual({
      height: 120,
      width: 240,
      x: 10,
      y: 20,
    });
    expect(views[0]?.webContents.loadedURLs).toEqual(["data:text/html,ok"]);
    expect(views[0]?.visible).toBe(true);
    expect(views[0]?.bounds).toEqual({ height: 120, width: 240, x: 0, y: 0 });
    expect(views[0]?.webContents.focusCount).toBe(1);
    expect(firstStats.boundsUpdateCount).toBe(0);
    expect(secondStats.boundsUpdateCount).toBe(0);
    expect(secondStats.live).toBe(1);
    expect(secondStats.focusedSurfaceId).toBe("surface-1");
  });

  test("clips native browser views to the visible stage while preserving pane-sized content", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(
      fakeEvent(),
      batch([
        {
          ...update("surface-1", true),
          bounds: { height: 130, width: 120, x: 300, y: 100 },
          contentBounds: { height: 130, width: 200, x: 220, y: 100 },
        },
      ]),
    );

    expect(owner.contentView.children[0]?.bounds).toEqual({
      height: 130,
      width: 120,
      x: 300,
      y: 100,
    });
    expect(view.bounds).toEqual({
      height: 130,
      width: 200,
      x: -80,
      y: 0,
    });
  });

  test("captures full pane-sized browser snapshots while the native view is clipped", async () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(
      fakeEvent(),
      batch([
        {
          ...update("surface-1", true),
          bounds: { height: 130, width: 120, x: 300, y: 100 },
          contentBounds: { height: 130, width: 200, x: 220, y: 100 },
        },
      ]),
    );
    await flushPromises();

    expect(view.webContents.captureRects).toEqual([{ height: 130, width: 200, x: 0, y: 0 }]);
    expect(view.webContents.captureOptions).toEqual([{ stayHidden: true }]);
    expect(owner.webContents.sent).toContainEqual({
      channel: ipcEvents.workspaceBrowserViewSnapshot,
      payload: {
        capturedAt: expect.any(Number),
        height: 130,
        imageDataUrl: "data:image/png;base64,capture-1",
        paneId: "surface-1-pane",
        surfaceId: "surface-1",
        title: "surface-1",
        width: 200,
        workspaceId: "phase-4-browser-pane-benchmark",
      },
    });
  });

  test("falls back to whole-page capture when hidden rect capture is unavailable", async () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });
    view.webContents.captureFailures.push(
      new Error("Current display surface not available for capture"),
    );

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    await flushPromises();

    expect(view.webContents.captureRects).toEqual([
      { height: 120, width: 240, x: 0, y: 0 },
      undefined,
    ]);
    expect(view.webContents.captureOptions).toEqual([{ stayHidden: true }, { stayHidden: true }]);
    const snapshots = owner.webContents.sent.filter(
      (message) => message.channel === ipcEvents.workspaceBrowserViewSnapshot,
    );
    expect(snapshots[0]?.payload).toMatchObject({
      imageDataUrl: "data:image/png;base64,capture-2",
      surfaceId: "surface-1",
    });
    expect(registry.readStats()).toMatchObject({
      snapshotCaptureLastError: null,
      snapshotCapturesFailed: 0,
      snapshotCapturesStarted: 1,
      snapshotCapturesSucceeded: 1,
    });
  });

  test("falls back to a clipped debugger screenshot when hidden page capture is unavailable", async () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });
    view.webContents.captureFailures.push(
      new Error("Current display surface not available for capture"),
      new Error("Current display surface not available for capture"),
    );
    view.webContents.debugger.nextScreenshotData = "RENDERED";

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    await flushPromises();

    expect(view.webContents.captureRects).toEqual([
      { height: 120, width: 240, x: 0, y: 0 },
      undefined,
    ]);
    expect(view.webContents.debugger.commands).toEqual([
      {
        commandParams: {
          captureBeyondViewport: true,
          clip: { height: 120, scale: 1, width: 240, x: 0, y: 0 },
          format: "png",
          fromSurface: false,
          optimizeForSpeed: true,
        },
        method: "Page.captureScreenshot",
      },
    ]);
    expect(view.webContents.debugger.attachCount).toBe(1);
    expect(view.webContents.debugger.detachCount).toBe(1);
    const snapshots = owner.webContents.sent.filter(
      (message) => message.channel === ipcEvents.workspaceBrowserViewSnapshot,
    );
    expect(snapshots[0]?.payload).toMatchObject({
      imageDataUrl: "data:image/png;base64,RENDERED",
      surfaceId: "surface-1",
    });
    expect(registry.readStats()).toMatchObject({
      snapshotCaptureLastError: null,
      snapshotCapturesFailed: 0,
      snapshotCapturesStarted: 1,
      snapshotCapturesSucceeded: 1,
    });
  });

  test("does not focus the owner renderer for visible unfocused browser panes", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    const stats = registry.applyBatch(fakeEvent(), batch([update("surface-1", false)]));

    expect(owner.webContents.focusCount).toBe(0);
    expect(view.webContents.focusCount).toBe(0);
    expect(stats.focusedSurfaceId).toBeNull();
  });

  test("does not route native browser focus while the owner window is unfocused", () => {
    const owner = new FakeOwnerWindow();
    owner.focused = false;
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    const stats = registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));

    expect(view.webContents.focusCount).toBe(0);
    expect(stats.focusedSurfaceId).toBe("surface-1");
  });

  test("returns focus to the owner renderer when routed browser focus clears", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    const stats = registry.applyBatch(fakeEvent(), batch([update("surface-1", false)]));

    expect(view.webContents.focusCount).toBe(1);
    expect(owner.webContents.focusCount).toBe(1);
    expect(stats.focusedSurfaceId).toBeNull();
  });

  test("leaves plain browser arrows in the browser view", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    const event = view.webContents.emitBeforeInput("ArrowRight");

    expect(event.prevented).toBe(false);
    expect(owner.webContents.sent).toEqual([]);
  });

  test("forwards browser workspace arrow shortcuts to the owning renderer", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    const event = view.webContents.emitBeforeInput("ArrowRight", { alt: true, meta: true });

    expect(event.prevented).toBe(true);
    expect(owner.webContents.sent).toEqual([
      {
        channel: ipcEvents.workspaceBrowserViewKey,
        payload: {
          altKey: true,
          ctrlKey: false,
          key: "ArrowRight",
          metaKey: true,
          shiftKey: false,
          surfaceId: "surface-1",
          workspaceId: "phase-4-browser-pane-benchmark",
        },
      },
    ]);
  });

  test("forwards browser control-alt arrow shortcuts to the owning renderer", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    const event = view.webContents.emitBeforeInput("ArrowLeft", { alt: true, control: true });

    expect(event.prevented).toBe(true);
    expect(owner.webContents.sent).toEqual([
      {
        channel: ipcEvents.workspaceBrowserViewKey,
        payload: {
          altKey: true,
          ctrlKey: true,
          key: "ArrowLeft",
          metaKey: false,
          shiftKey: false,
          surfaceId: "surface-1",
          workspaceId: "phase-4-browser-pane-benchmark",
        },
      },
    ]);
  });

  test("forwards browser control-alt enter workspace shortcuts to the owning renderer", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    const event = view.webContents.emitBeforeInput("Enter", { alt: true, control: true });

    expect(event.prevented).toBe(true);
    expect(owner.webContents.sent).toEqual([
      {
        channel: ipcEvents.workspaceBrowserViewKey,
        payload: {
          altKey: true,
          ctrlKey: true,
          key: "Enter",
          metaKey: false,
          shiftKey: false,
          surfaceId: "surface-1",
          workspaceId: "phase-4-browser-pane-benchmark",
        },
      },
    ]);
  });

  test("forwards browser-hosted workspace overview shortcuts to the owning renderer", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    const event = view.webContents.emitBeforeInput("O", { meta: true });

    expect(event.prevented).toBe(true);
    expect(owner.webContents.sent).toContainEqual({
      channel: ipcEvents.workspaceBrowserViewKey,
      payload: {
        altKey: false,
        ctrlKey: false,
        key: "o",
        metaKey: true,
        shiftKey: false,
        surfaceId: "surface-1",
        workspaceId: "phase-4-browser-pane-benchmark",
      },
    });
  });

  test("forwards global master text and voice shortcuts from native browser panes", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    const controlEvent = view.webContents.emitBeforeInput("K", { control: true });
    const voiceEvent = view.webContents.emitBeforeInput("K", { control: true, shift: true });
    const alternateVoiceEvent = view.webContents.emitBeforeInput("K", { alt: true, shift: true });
    const modifiedEvent = view.webContents.emitBeforeInput("K", { alt: true, control: true });

    expect(controlEvent.prevented).toBe(true);
    expect(voiceEvent.prevented).toBe(true);
    expect(alternateVoiceEvent.prevented).toBe(true);
    expect(modifiedEvent.prevented).toBe(false);
    expect(owner.webContents.sent).toContainEqual({
      channel: ipcEvents.workspaceBrowserViewKey,
      payload: {
        altKey: false,
        ctrlKey: true,
        key: "k",
        metaKey: false,
        shiftKey: false,
        surfaceId: "surface-1",
        workspaceId: "phase-4-browser-pane-benchmark",
      },
    });
    expect(owner.webContents.sent).toContainEqual({
      channel: ipcEvents.workspaceBrowserViewKey,
      payload: {
        altKey: false,
        ctrlKey: true,
        key: "k",
        metaKey: false,
        shiftKey: true,
        surfaceId: "surface-1",
        workspaceId: "phase-4-browser-pane-benchmark",
      },
    });
  });

  test("captures settled browser view snapshots for renderer texture handoff", async () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    await flushPromises();
    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    await flushPromises();

    expect(view.webContents.captureCount).toBe(1);
    expect(owner.webContents.sent).toContainEqual({
      channel: ipcEvents.workspaceBrowserViewSnapshot,
      payload: {
        capturedAt: expect.any(Number),
        height: 120,
        imageDataUrl: "data:image/png;base64,capture-1",
        paneId: "surface-1-pane",
        surfaceId: "surface-1",
        title: "surface-1",
        width: 240,
        workspaceId: "phase-4-browser-pane-benchmark",
      },
    });
  });

  test("captures browser snapshots when Electron reports a finished load", async () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const load = deferredLoad();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });
    view.webContents.nextLoadPromise = load.promise;

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    await flushPromises();

    expect(view.webContents.captureCount).toBe(0);

    view.webContents.emitDidFinishLoad();
    await flushPromises();

    expect(view.webContents.captureCount).toBe(1);
    expect(owner.webContents.sent).toContainEqual({
      channel: ipcEvents.workspaceBrowserViewSnapshot,
      payload: {
        capturedAt: expect.any(Number),
        height: 120,
        imageDataUrl: "data:image/png;base64,capture-1",
        paneId: "surface-1-pane",
        surfaceId: "surface-1",
        title: "surface-1",
        width: 240,
        workspaceId: "phase-4-browser-pane-benchmark",
      },
    });

    load.resolve();
    await flushPromises();

    expect(view.webContents.captureCount).toBe(1);
  });

  test("registers new browser records before starting their first load", async () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });
    view.webContents.emitDidFinishDuringLoad = true;

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    await flushPromises();

    expect(view.webContents.captureCount).toBe(1);
    expect(owner.webContents.sent).toContainEqual({
      channel: ipcEvents.workspaceBrowserViewSnapshot,
      payload: expect.objectContaining({
        imageDataUrl: "data:image/png;base64,capture-1",
        surfaceId: "surface-1",
      }),
    });
  });

  test("labels in-flight browser snapshots with the bounds captured at request time", async () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const capture = deferredCapture();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });
    view.webContents.nextCapturePromise = capture.promise;

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    await flushPromises();
    registry.applyBatch(
      fakeEvent(),
      batch([
        {
          ...update("surface-1", true),
          bounds: { height: 120, width: 320, x: 10, y: 20 },
          contentBounds: { height: 120, width: 320, x: 10, y: 20 },
        },
      ]),
    );
    capture.resolve({
      toDataURL() {
        return "data:image/png;base64,stale-width";
      },
    });
    await flushPromises();

    const snapshots = owner.webContents.sent.filter(
      (message) => message.channel === ipcEvents.workspaceBrowserViewSnapshot,
    );
    expect(snapshots[0]?.payload).toMatchObject({
      height: 120,
      imageDataUrl: "data:image/png;base64,stale-width",
      surfaceId: "surface-1",
      width: 240,
    });
    expect(view.webContents.captureCount).toBe(2);
  });

  test("keeps absent views live until an explicit hidden update and destroys them on teardown", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(fakeEvent(), batch([update("surface-1", false)]));
    const unchangedStats = registry.applyBatch(fakeEvent(), batch([]));
    const hiddenStats = registry.applyBatch(fakeEvent(), batch([hiddenUpdate("surface-1")]));
    const teardownStats = registry.teardownWorkspace("phase-4-browser-pane-benchmark");

    expect(unchangedStats).toMatchObject({ hidden: 0, live: 1, registered: 1 });
    expect(hiddenStats).toMatchObject({ hidden: 1, live: 0, registered: 1 });
    expect(view.visible).toBe(false);
    expect(owner.contentView.children).toHaveLength(0);
    expect(view.webContents.closed).toBe(true);
    expect(teardownStats).toMatchObject({
      live: 0,
      registered: 0,
      teardownCount: 1,
    });
  });

  test("suppresses canceled browser loads while hidden and retries when visible again", async () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    try {
      view.webContents.loadFailures.push(new Error("ERR_FAILED"));

      registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
      registry.applyBatch(fakeEvent(), batch([hiddenUpdate("surface-1")]));
      await flushPromises();
      registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
      await flushPromises();

      expect(view.webContents.loadedURLs).toEqual(["data:text/html,ok", "data:text/html,ok"]);
      expect(stderrWrite).not.toHaveBeenCalled();
    } finally {
      stderrWrite.mockRestore();
    }
  });

  test("suppresses canceled browser captures after the view is hidden", async () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const capture = deferredCaptureFailure();
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    try {
      view.webContents.nextCapturePromise = capture.promise;

      registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
      await flushPromises();
      registry.applyBatch(fakeEvent(), batch([hiddenUpdate("surface-1")]));
      capture.reject(new Error("Current display surface not available for capture"));
      await flushPromises();

      expect(view.webContents.captureCount).toBe(1);
      expect(stderrWrite).not.toHaveBeenCalled();
    } finally {
      stderrWrite.mockRestore();
    }
  });

  test("suppresses unavailable display capture failures while visible", async () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const registry = new WebContentsViewRegistry({
      createClipView: () => new FakeNativeView() as never,
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    try {
      view.webContents.captureFailures.push(
        new Error("Current display surface not available for capture"),
        new Error("Current display surface not available for capture"),
      );
      view.webContents.debugger.failures.push(
        new Error("Current display surface not available for capture"),
      );

      registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
      await flushPromises();
      await flushPromises();

      expect(view.webContents.captureCount).toBe(2);
      expect(view.webContents.debugger.commands).toHaveLength(1);
      expect(registry.readStats()).toMatchObject({
        snapshotCaptureLastError: "Current display surface not available for capture",
        snapshotCapturesFailed: 1,
        snapshotCapturesStarted: 1,
        snapshotCapturesSucceeded: 0,
      });
      expect(stderrWrite).not.toHaveBeenCalled();
    } finally {
      stderrWrite.mockRestore();
    }
  });
});

class FakeContentView {
  children: FakeNativeView[] = [];

  addChildView(view: FakeNativeView): void {
    this.children.push(view);
  }

  removeChildView(view: FakeNativeView): void {
    this.children = this.children.filter((candidate) => candidate !== view);
  }
}

function hiddenUpdate(surfaceId: string): WorkspaceBrowserViewBatch["updates"][number] {
  return {
    ...update(surfaceId, false),
    runtimeState: "hidden",
    visible: false,
  };
}

class FakeNativeView {
  bounds: Rectangle = { height: 1, width: 1, x: 0, y: 0 };
  children: FakeNativeView[] = [];
  visible = false;
  webContents = new FakeNativeWebContents();

  addChildView(view: FakeNativeView): void {
    this.children.push(view);
  }

  getBounds(): Rectangle {
    return this.bounds;
  }

  removeChildView(view: FakeNativeView): void {
    this.children = this.children.filter((candidate) => candidate !== view);
  }

  setBounds(bounds: Rectangle): void {
    this.bounds = bounds;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }
}

type FakeBeforeInputListener = (
  event: { preventDefault(): void },
  input: {
    alt: boolean;
    control: boolean;
    key: string;
    meta: boolean;
    shift: boolean;
    type: string;
  },
) => void;

type FakeLoadFinishedListener = () => void;

class FakeNativeWebContents {
  captureCount = 0;
  captureFailures: Error[] = [];
  captureOptions: Array<{ stayHidden?: boolean } | undefined> = [];
  captureRects: Array<Rectangle | undefined> = [];
  closed = false;
  debugger = new FakeNativeWebContentsDebugger();
  emitDidFinishDuringLoad = false;
  focusCount = 0;
  loadFailures: Error[] = [];
  loadedURLs: string[] = [];
  nextCapturePromise: Promise<{ toDataURL(): string }> | null = null;
  nextLoadPromise: Promise<void> | null = null;
  private beforeInputListener: FakeBeforeInputListener | null = null;
  private didFinishLoadListener: FakeLoadFinishedListener | null = null;

  close(): void {
    this.closed = true;
  }

  capturePage(rect?: Rectangle, opts?: { stayHidden?: boolean }): Promise<{ toDataURL(): string }> {
    this.captureCount += 1;
    this.captureOptions.push(opts);
    this.captureRects.push(rect);
    const captureCount = this.captureCount;
    const failure = this.captureFailures.shift();
    if (failure) {
      return Promise.reject(failure);
    }
    if (this.nextCapturePromise) {
      const promise = this.nextCapturePromise;
      this.nextCapturePromise = null;
      return promise;
    }
    return Promise.resolve({
      toDataURL() {
        return `data:image/png;base64,capture-${captureCount}`;
      },
    });
  }

  emitBeforeInput(
    key: string,
    modifiers: { alt?: boolean; control?: boolean; meta?: boolean; shift?: boolean } = {},
  ): { prevented: boolean } {
    const event = {
      prevented: false,
      preventDefault() {
        event.prevented = true;
      },
    };
    this.beforeInputListener?.(event, {
      alt: modifiers.alt ?? false,
      control: modifiers.control ?? false,
      key,
      meta: modifiers.meta ?? false,
      shift: modifiers.shift ?? false,
      type: "keyDown",
    });
    return event;
  }

  emitDidFinishLoad(): void {
    this.didFinishLoadListener?.();
  }

  focus(): void {
    this.focusCount += 1;
  }

  isDestroyed(): boolean {
    return this.closed;
  }

  loadURL(url: string): Promise<void> {
    this.loadedURLs.push(url);
    if (this.emitDidFinishDuringLoad) {
      this.emitDidFinishLoad();
    }
    const failure = this.loadFailures.shift();
    if (failure) {
      return Promise.reject(failure);
    }
    if (this.nextLoadPromise) {
      const promise = this.nextLoadPromise;
      this.nextLoadPromise = null;
      return promise;
    }
    return Promise.resolve();
  }

  on(event: "before-input-event", listener: FakeBeforeInputListener): void;
  on(event: "did-finish-load", listener: FakeLoadFinishedListener): void;
  on(
    event: "before-input-event" | "did-finish-load",
    listener: FakeBeforeInputListener | FakeLoadFinishedListener,
  ): void {
    if (event === "before-input-event") {
      this.beforeInputListener = listener as FakeBeforeInputListener;
      return;
    }
    this.didFinishLoadListener = listener as FakeLoadFinishedListener;
  }

  removeListener(event: "before-input-event", listener: FakeBeforeInputListener): void;
  removeListener(event: "did-finish-load", listener: FakeLoadFinishedListener): void;
  removeListener(
    event: "before-input-event" | "did-finish-load",
    listener: FakeBeforeInputListener | FakeLoadFinishedListener,
  ): void {
    if (event === "before-input-event") {
      if (this.beforeInputListener === listener) {
        this.beforeInputListener = null;
      }
      return;
    }
    if (this.didFinishLoadListener === listener) {
      this.didFinishLoadListener = null;
    }
  }
}

class FakeNativeWebContentsDebugger {
  attachCount = 0;
  attached = false;
  commands: Array<{ commandParams?: unknown; method: string }> = [];
  detachCount = 0;
  failures: Error[] = [];
  nextScreenshotData = "DEBUGGER";

  attach(): void {
    this.attachCount += 1;
    this.attached = true;
  }

  detach(): void {
    this.detachCount += 1;
    this.attached = false;
  }

  isAttached(): boolean {
    return this.attached;
  }

  sendCommand(method: string, commandParams?: unknown): Promise<unknown> {
    this.commands.push({ commandParams, method });
    const failure = this.failures.shift();
    if (failure) {
      return Promise.reject(failure);
    }
    return Promise.resolve({ data: this.nextScreenshotData });
  }
}

class FakeOwnerWindow {
  contentView = new FakeContentView();
  focused = true;
  webContents = {
    focusCount: 0,
    sent: [] as Array<{ channel: string; payload: unknown }>,
    focus: () => {
      this.webContents.focusCount += 1;
    },
    send: (channel: string, payload: unknown) => {
      this.webContents.sent.push({ channel, payload });
    },
  };

  isFocused(): boolean {
    return this.focused;
  }
}

function batch(updates: WorkspaceBrowserViewBatch["updates"]): WorkspaceBrowserViewBatch {
  return {
    focusedSurfaceId: updates.find((candidate) => candidate.focused)?.surfaceId ?? null,
    totalBrowserPanes: 24,
    updates,
    visibleBrowserPanes: updates.length,
    workspaceId: "phase-4-browser-pane-benchmark",
  };
}

function fakeEvent(): IpcMainEvent {
  return {} as IpcMainEvent;
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

function deferredCaptureFailure(): {
  promise: Promise<{ toDataURL(): string }>;
  reject: (error: Error) => void;
} {
  const { promise, reject } = deferredCapture();
  return { promise, reject };
}

function deferredCapture(): {
  promise: Promise<{ toDataURL(): string }>;
  reject: (error: Error) => void;
  resolve: (image: { toDataURL(): string }) => void;
} {
  let reject!: (error: Error) => void;
  let resolve!: (image: { toDataURL(): string }) => void;
  const promise = new Promise<{ toDataURL(): string }>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function deferredLoad(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function update(surfaceId: string, focused: boolean): WorkspaceBrowserViewBatch["updates"][number] {
  return {
    bounds: { height: 120, width: 240, x: 10, y: 20 },
    contentBounds: { height: 120, width: 240, x: 10, y: 20 },
    focused,
    paneId: `${surfaceId}-pane`,
    runtimeState: "live",
    surfaceId,
    title: surfaceId,
    url: "data:text/html,ok",
    visible: true,
  };
}
