import { WebContentsView, ipcMain, type BrowserWindow } from "electron";
import { pathToFileURL } from "node:url";

import type {
  BrowserPaneBounds,
  BrowserPaneEvents,
  BrowserPanePoint,
  BrowserPaneScreenshot,
  BrowserPaneSnapshot,
  BrowserPaneStatus,
} from "@shared/types";

export interface BrowserPaneController {
  captureScreenshot: () => Promise<BrowserPaneScreenshot>;
  click: (point: BrowserPanePoint) => Promise<void>;
  destroy: () => void;
  events: () => BrowserPaneEvents;
  focus: () => Promise<void>;
  inspect: (selector: string) => Promise<BrowserPaneSnapshot | null>;
  loadPreview: () => Promise<BrowserPaneStatus>;
  setBounds: (bounds: BrowserPaneBounds) => BrowserPaneStatus;
  status: () => BrowserPaneStatus;
  typeText: (text: string) => Promise<void>;
}

export function createBrowserPane(
  window: BrowserWindow,
  previewFile: string,
): BrowserPaneController {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const previewURL = pathToFileURL(previewFile).toString();
  const consoleEvents: string[] = [];
  const networkEvents: string[] = [];
  let bounds: BrowserPaneBounds = { height: 1, width: 1, x: 0, y: 0 };
  let destroyed = false;

  window.contentView.addChildView(view);
  view.setBackgroundColor("#ffffff");
  view.webContents.on("console-message", (_event, _level, message) => {
    appendEvent(consoleEvents, message);
  });
  view.webContents.session.webRequest.onCompleted(
    { urls: ["file://*/*", "http://127.0.0.1/*"] },
    (details) => {
      appendEvent(networkEvents, `${details.method} ${details.url} ${details.statusCode}`);
    },
  );

  return {
    captureScreenshot: async () => {
      const image = await view.webContents.capturePage();
      const size = image.getSize();
      return { height: size.height, pngBytes: image.toPNG().byteLength, width: size.width };
    },
    click: async (point) => {
      view.webContents.focus();
      view.webContents.sendInputEvent({
        button: "left",
        clickCount: 1,
        type: "mouseDown",
        ...point,
      });
      view.webContents.sendInputEvent({ button: "left", clickCount: 1, type: "mouseUp", ...point });
    },
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      if (window.isDestroyed()) {
        return;
      }
      const contents = view.webContents;
      window.contentView.removeChildView(view);
      if (!contents.isDestroyed()) {
        contents.close();
      }
    },
    events: () => ({ console: [...consoleEvents], network: [...networkEvents] }),
    focus: async () => {
      view.webContents.focus();
    },
    inspect: (selector) => inspect(view, selector),
    loadPreview: async () => {
      await view.webContents.loadURL(previewURL);
      return browserPaneStatus(view, bounds);
    },
    setBounds: (nextBounds) => {
      bounds = normalizeBounds(nextBounds);
      view.setBounds(bounds);
      return browserPaneStatus(view, bounds);
    },
    status: () => browserPaneStatus(view, bounds),
    typeText: async (text) => {
      view.webContents.focus();
      await view.webContents.insertText(text);
    },
  };
}

export function registerBrowserPaneIpc(getController: () => BrowserPaneController | null) {
  ipcMain.handle("browser-pane:capture-screenshot", () =>
    requireController(getController()).captureScreenshot(),
  );
  ipcMain.handle("browser-pane:click", (_event, point: BrowserPanePoint) =>
    requireController(getController()).click(point),
  );
  ipcMain.handle("browser-pane:events", () => requireController(getController()).events());
  ipcMain.handle("browser-pane:focus", () => requireController(getController()).focus());
  ipcMain.handle("browser-pane:inspect", (_event, selector: string) =>
    requireController(getController()).inspect(selector),
  );
  ipcMain.handle("browser-pane:load-preview", () =>
    requireController(getController()).loadPreview(),
  );
  ipcMain.handle("browser-pane:set-bounds", (_event, bounds: BrowserPaneBounds) =>
    requireController(getController()).setBounds(bounds),
  );
  ipcMain.handle("browser-pane:status", () => requireController(getController()).status());
  ipcMain.handle("browser-pane:type-text", (_event, text: string) =>
    requireController(getController()).typeText(text),
  );
}

function requireController(controller: BrowserPaneController | null) {
  if (!controller) {
    throw new Error("browser pane is not available");
  }
  return controller;
}

async function inspect(
  view: WebContentsView,
  selector: string,
): Promise<BrowserPaneSnapshot | null> {
  return view.webContents.executeJavaScript(`
    (() => {
      const selector = ${JSON.stringify(selector)};
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        documentHasFocus: document.hasFocus(),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        selector,
        tagName: element.tagName.toLowerCase(),
        text: element.textContent ?? "",
        title: document.title,
        value: "value" in element ? element.value : null
      };
    })();
  `);
}

function browserPaneStatus(view: WebContentsView, bounds: BrowserPaneBounds): BrowserPaneStatus {
  return {
    bounds,
    focused: view.webContents.isFocused(),
    url: view.webContents.getURL(),
  };
}

function normalizeBounds(bounds: BrowserPaneBounds): BrowserPaneBounds {
  return {
    height: normalizeDimension(bounds.height),
    width: normalizeDimension(bounds.width),
    x: normalizeCoordinate(bounds.x),
    y: normalizeCoordinate(bounds.y),
  };
}

function normalizeCoordinate(value: number): number {
  assertFiniteNumber(value);
  return Math.max(0, Math.round(value));
}

function normalizeDimension(value: number): number {
  assertFiniteNumber(value);
  return Math.max(1, Math.round(value));
}

function assertFiniteNumber(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`browser pane bounds must be finite numbers: ${value}`);
  }
}

function appendEvent(events: string[], value: string) {
  events.push(value);
  if (events.length > 100) {
    events.shift();
  }
}
