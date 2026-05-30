import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, test, vi } from "vitest";

import { ipcChannels } from "@shared/ipc";
import type { BrowserPaneController } from "./browser-pane";
import { registerBrowserPaneIpc } from "./browser-pane";

vi.mock("electron", () => ({
  WebContentsView: class {},
  ipcMain: {
    handle: vi.fn(),
  },
}));

describe("browser pane IPC", () => {
  test("registers shared browser pane channels", async () => {
    type MainHandler = Parameters<IpcMain["handle"]>[1];
    const handlers = new Map<string, MainHandler>();
    const main: Pick<IpcMain, "handle"> = {
      handle: (channel, handler) => {
        handlers.set(channel, handler);
      },
    };
    const controller = testBrowserPaneController();

    registerBrowserPaneIpc(() => controller, main);

    expect([...handlers.keys()].sort()).toEqual(
      [
        ipcChannels.browserPaneCaptureScreenshot,
        ipcChannels.browserPaneClick,
        ipcChannels.browserPaneEvents,
        ipcChannels.browserPaneFocus,
        ipcChannels.browserPaneInspect,
        ipcChannels.browserPaneLoadPreview,
        ipcChannels.browserPaneSetBounds,
        ipcChannels.browserPaneStatus,
        ipcChannels.browserPaneTypeText,
      ].sort(),
    );
    await expect(
      requireHandler(handlers, ipcChannels.browserPaneInspect)(
        {} as IpcMainInvokeEvent,
        "#preview-title",
      ),
    ).resolves.toMatchObject({ selector: "#preview-title" });
    expect(
      await requireHandler(handlers, ipcChannels.browserPaneSetBounds)({} as IpcMainInvokeEvent, {
        height: 4,
        width: 3,
        x: 1,
        y: 2,
      }),
    ).toMatchObject({ bounds: { height: 4, width: 3, x: 1, y: 2 } });
  });
});

function requireHandler(
  handlers: Map<string, Parameters<IpcMain["handle"]>[1]>,
  channel: string,
): Parameters<IpcMain["handle"]>[1] {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`handler was not registered for ${channel}`);
  }
  return handler;
}

function testBrowserPaneController(): BrowserPaneController {
  return {
    captureScreenshot: async () => ({ height: 1, pngBytes: 1, width: 1 }),
    click: async () => {},
    destroy: () => {},
    events: () => ({ console: [], network: [] }),
    focus: async () => {},
    inspect: async (selector) => ({
      documentHasFocus: true,
      rect: { height: 1, width: 1, x: 0, y: 0 },
      selector,
      tagName: "h1",
      text: "Preview",
      title: "Preview",
      value: null,
    }),
    loadPreview: async () => ({
      bounds: { height: 1, width: 1, x: 0, y: 0 },
      focused: false,
      url: "file:///preview.html",
    }),
    setBounds: (bounds) => ({
      bounds,
      focused: false,
      url: "file:///preview.html",
    }),
    status: () => ({
      bounds: { height: 1, width: 1, x: 0, y: 0 },
      focused: false,
      url: "file:///preview.html",
    }),
    typeText: async () => {},
  };
}
