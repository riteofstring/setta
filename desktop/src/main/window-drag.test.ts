import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, test } from "vitest";

import { AppWindowDragController } from "./window-drag";

describe("app window drag controller", () => {
  test("moves a BrowserWindow by pointer screen deltas", () => {
    const window = new FakeDraggableWindow(120, 80);
    const controller = new AppWindowDragController(() => window);
    const event = fakeEvent(7);

    controller.start(event, { screenX: 400, screenY: 200 });
    controller.move(event, { screenX: 455, screenY: 260 });

    expect(window.position).toEqual([175, 140]);
  });

  test("ignores moves after the drag session ends", () => {
    const window = new FakeDraggableWindow(120, 80);
    const controller = new AppWindowDragController(() => window);
    const event = fakeEvent(7);

    controller.start(event, { screenX: 400, screenY: 200 });
    controller.end(event);
    controller.move(event, { screenX: 455, screenY: 260 });

    expect(window.position).toEqual([120, 80]);
  });

  test("rejects drag starts without an active BrowserWindow", () => {
    const controller = new AppWindowDragController(() => null);

    expect(() => controller.start(fakeEvent(7), { screenX: 400, screenY: 200 })).toThrow(
      "window drag request has no active BrowserWindow",
    );
  });

  test("rejects non-finite pointer coordinates", () => {
    const window = new FakeDraggableWindow(120, 80);
    const controller = new AppWindowDragController(() => window);

    expect(() => controller.start(fakeEvent(7), { screenX: Number.NaN, screenY: 200 })).toThrow(
      "window drag point must contain finite screen coordinates",
    );
  });
});

class FakeDraggableWindow {
  position: [number, number];

  constructor(x: number, y: number) {
    this.position = [x, y];
  }

  getPosition(): [number, number] {
    return this.position;
  }

  isDestroyed(): boolean {
    return false;
  }

  setPosition(x: number, y: number): void {
    this.position = [x, y];
  }
}

function fakeEvent(senderId: number): IpcMainInvokeEvent {
  return {
    sender: {
      id: senderId,
    },
  } as IpcMainInvokeEvent;
}
