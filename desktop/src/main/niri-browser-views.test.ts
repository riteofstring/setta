import type { IpcMainEvent, Rectangle } from "electron";
import { describe, expect, test } from "vitest";

import { ipcEvents } from "@shared/ipc";
import type { NiriBrowserViewBatch } from "@shared/types";
import { WebContentsViewRegistry } from "./niri-browser-views";

describe("niri WebContentsView registry", () => {
  test("creates browser views, applies changed bounds, and routes focus", () => {
    const owner = new FakeOwnerWindow();
    const views: FakeNativeView[] = [];
    const registry = new WebContentsViewRegistry({
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
    expect(views[0]?.webContents.loadedURLs).toEqual(["data:text/html,ok"]);
    expect(views[0]?.visible).toBe(true);
    expect(views[0]?.bounds).toEqual({ height: 120, width: 240, x: 10, y: 20 });
    expect(views[0]?.webContents.focusCount).toBe(2);
    expect(firstStats.boundsUpdateCount).toBe(0);
    expect(secondStats.boundsUpdateCount).toBe(0);
    expect(secondStats.live).toBe(1);
    expect(secondStats.focusedSurfaceId).toBe("surface-1");
  });

  test("forwards browser arrow keys to the owning renderer", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
      createView: () => view as never,
      windowFromIpcEvent: () => owner as never,
    });

    registry.applyBatch(fakeEvent(), batch([update("surface-1", true)]));
    const event = view.webContents.emitBeforeInput("ArrowRight");

    expect(event.prevented).toBe(true);
    expect(owner.webContents.sent).toEqual([
      {
        channel: ipcEvents.niriBrowserViewKey,
        payload: {
          key: "ArrowRight",
          surfaceId: "surface-1",
          workspaceId: "phase-4-browser-pane-benchmark",
        },
      },
    ]);
  });

  test("keeps absent views live until an explicit hidden update and destroys them on teardown", () => {
    const owner = new FakeOwnerWindow();
    const view = new FakeNativeView();
    const registry = new WebContentsViewRegistry({
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

function hiddenUpdate(surfaceId: string): NiriBrowserViewBatch["updates"][number] {
  return {
    ...update(surfaceId, false),
    runtimeState: "hidden",
    visible: false,
  };
}

class FakeNativeView {
  bounds: Rectangle = { height: 1, width: 1, x: 0, y: 0 };
  visible = false;
  webContents = new FakeNativeWebContents();

  getBounds(): Rectangle {
    return this.bounds;
  }

  setBounds(bounds: Rectangle): void {
    this.bounds = bounds;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }
}

class FakeNativeWebContents {
  closed = false;
  focusCount = 0;
  loadedURLs: string[] = [];
  private listener:
    | ((event: { preventDefault(): void }, input: { key: string; type: string }) => void)
    | null = null;

  close(): void {
    this.closed = true;
  }

  emitBeforeInput(key: string): { prevented: boolean } {
    const event = {
      prevented: false,
      preventDefault() {
        event.prevented = true;
      },
    };
    this.listener?.(event, { key, type: "keyDown" });
    return event;
  }

  focus(): void {
    this.focusCount += 1;
  }

  isDestroyed(): boolean {
    return this.closed;
  }

  loadURL(url: string): Promise<void> {
    this.loadedURLs.push(url);
    return Promise.resolve();
  }

  on(
    _event: "before-input-event",
    listener: (event: { preventDefault(): void }, input: { key: string; type: string }) => void,
  ): void {
    this.listener = listener;
  }

  removeListener(
    _event: "before-input-event",
    listener: (event: { preventDefault(): void }, input: { key: string; type: string }) => void,
  ): void {
    if (this.listener === listener) {
      this.listener = null;
    }
  }
}

class FakeOwnerWindow {
  contentView = new FakeContentView();
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
}

function batch(updates: NiriBrowserViewBatch["updates"]): NiriBrowserViewBatch {
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

function update(surfaceId: string, focused: boolean): NiriBrowserViewBatch["updates"][number] {
  return {
    bounds: { height: 120, width: 240, x: 10, y: 20 },
    focused,
    paneId: `${surfaceId}-pane`,
    runtimeState: "live",
    surfaceId,
    title: surfaceId,
    url: "data:text/html,ok",
    visible: true,
  };
}
