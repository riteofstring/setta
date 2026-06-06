import { BrowserWindow, WebContentsView } from "electron";
import type { IpcMainEvent, Rectangle } from "electron";

import { ipcEvents } from "@shared/ipc";
import type {
  NiriBrowserViewBatch,
  NiriBrowserViewKeyEvent,
  NiriBrowserViewStats,
  NiriBrowserViewUpdate,
} from "@shared/types";

interface NativeViewParent {
  addChildView(view: NativeBrowserView): void;
  removeChildView(view: NativeBrowserView): void;
}

interface OwnerWebContents {
  focus(): void;
  send(channel: string, payload: unknown): void;
}

interface OwnerWindow {
  contentView: NativeViewParent;
  webContents: OwnerWebContents;
}

interface NativeBrowserWebContents {
  close(): void;
  focus(): void;
  isDestroyed(): boolean;
  loadURL(url: string): Promise<void>;
  on(event: "before-input-event", listener: BeforeInputListener): void;
  removeListener(event: "before-input-event", listener: BeforeInputListener): void;
}

interface NativeBrowserView {
  getBounds(): Rectangle;
  setBounds(bounds: Rectangle): void;
  setVisible(visible: boolean): void;
  webContents: NativeBrowserWebContents;
}

interface BeforeInputEvent {
  preventDefault(): void;
}

interface BeforeInput {
  key: string;
  type: string;
}

type BeforeInputListener = (event: BeforeInputEvent, input: BeforeInput) => void;

interface BrowserViewRecord {
  bounds: Rectangle;
  focused: boolean;
  listener: BeforeInputListener;
  parent: NativeViewParent;
  paneId: string;
  title: string;
  url: string;
  view: NativeBrowserView;
  visible: boolean;
  workspaceId: string;
}

interface WebContentsViewRegistryDependencies {
  createView: () => NativeBrowserView;
  windowFromIpcEvent: (event: IpcMainEvent) => OwnerWindow | null;
}

export class WebContentsViewRegistry {
  private readonly records = new Map<string, BrowserViewRecord>();
  private stats: NiriBrowserViewStats = emptyStats(null);

  constructor(private readonly dependencies: WebContentsViewRegistryDependencies) {}

  applyBatch(event: IpcMainEvent, rawBatch: unknown): NiriBrowserViewStats {
    const batch = decodeBatch(rawBatch);
    const ownerWindow = this.requireOwnerWindow(event);
    this.stats.boundsBatchCount += 1;
    this.stats.totalBrowserPanes = batch.totalBrowserPanes;
    this.stats.visibleBrowserPanes = batch.visibleBrowserPanes;
    this.stats.workspaceId = batch.workspaceId;

    const liveSurfaceIds = new Set<string>();
    for (const update of batch.updates) {
      if (update.runtimeState === "destroyed") {
        this.destroyRecord(update.surfaceId);
        continue;
      }
      if (!update.visible || update.runtimeState !== "live") {
        this.hideRecord(update.surfaceId);
        continue;
      }
      liveSurfaceIds.add(update.surfaceId);
      this.upsertLiveRecord(ownerWindow, batch.workspaceId, update);
    }

    for (const [surfaceId, record] of this.records) {
      if (record.workspaceId === batch.workspaceId && !liveSurfaceIds.has(surfaceId)) {
        this.hideRecord(surfaceId);
      }
    }

    this.routeFocus(ownerWindow, batch.focusedSurfaceId);
    this.recount();
    return this.readStats();
  }

  readStats(): NiriBrowserViewStats {
    return { ...this.stats };
  }

  teardownAll(): NiriBrowserViewStats {
    for (const surfaceId of [...this.records.keys()]) {
      this.destroyRecord(surfaceId);
    }
    this.stats.focusedSurfaceId = null;
    this.stats.teardownCount += 1;
    this.stats.workspaceId = null;
    this.recount();
    return this.readStats();
  }

  teardownWorkspace(workspaceId: string): NiriBrowserViewStats {
    for (const [surfaceId, record] of this.records) {
      if (record.workspaceId === workspaceId) {
        this.destroyRecord(surfaceId);
      }
    }
    if (this.stats.workspaceId === workspaceId) {
      this.stats.focusedSurfaceId = null;
      this.stats.workspaceId = null;
    }
    this.stats.teardownCount += 1;
    this.recount();
    return this.readStats();
  }

  private createRecord(
    ownerWindow: OwnerWindow,
    workspaceId: string,
    update: NiriBrowserViewUpdate,
  ): BrowserViewRecord {
    const view = this.dependencies.createView();
    const listener: BeforeInputListener = (event, input) => {
      if (input.type !== "keyDown" || !isArrowKey(input.key)) {
        return;
      }
      event.preventDefault();
      ownerWindow.webContents.send(ipcEvents.niriBrowserViewKey, {
        key: input.key,
        surfaceId: update.surfaceId,
        workspaceId,
      } satisfies NiriBrowserViewKeyEvent);
    };
    view.webContents.on("before-input-event", listener);
    ownerWindow.contentView.addChildView(view);
    void view.webContents.loadURL(update.url).catch((error: unknown) => {
      process.stderr.write(
        `failed to load niri browser pane ${update.surfaceId}: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    });
    const bounds = rectangleFromUpdate(update);
    view.setBounds(bounds);
    view.setVisible(true);
    return {
      bounds,
      focused: false,
      listener,
      parent: ownerWindow.contentView,
      paneId: update.paneId,
      title: update.title,
      url: update.url,
      view,
      visible: true,
      workspaceId,
    };
  }

  private destroyRecord(surfaceId: string): void {
    const record = this.records.get(surfaceId);
    if (!record) {
      return;
    }
    record.view.setVisible(false);
    record.view.webContents.removeListener("before-input-event", record.listener);
    record.parent.removeChildView(record.view);
    if (!record.view.webContents.isDestroyed()) {
      record.view.webContents.close();
    }
    this.records.delete(surfaceId);
    this.stats.destroyed += 1;
    if (this.stats.focusedSurfaceId === surfaceId) {
      this.stats.focusedSurfaceId = null;
    }
  }

  private hideRecord(surfaceId: string): void {
    const record = this.records.get(surfaceId);
    if (!record || !record.visible) {
      return;
    }
    record.view.setVisible(false);
    record.visible = false;
    record.focused = false;
    if (this.stats.focusedSurfaceId === surfaceId) {
      this.stats.focusedSurfaceId = null;
    }
  }

  private recount(): void {
    let hidden = 0;
    let live = 0;
    for (const record of this.records.values()) {
      if (record.visible) {
        live += 1;
      } else {
        hidden += 1;
      }
    }
    this.stats.hidden = hidden;
    this.stats.live = live;
    this.stats.registered = this.records.size;
  }

  private requireOwnerWindow(event: IpcMainEvent): OwnerWindow {
    const ownerWindow = this.dependencies.windowFromIpcEvent(event);
    if (!ownerWindow) {
      throw new Error("niri browser view batch has no owning BrowserWindow");
    }
    return ownerWindow;
  }

  private routeFocus(ownerWindow: OwnerWindow, focusedSurfaceId: string | null): void {
    if (!focusedSurfaceId) {
      ownerWindow.webContents.focus();
      this.stats.focusedSurfaceId = null;
      for (const record of this.records.values()) {
        record.focused = false;
      }
      return;
    }
    const record = this.records.get(focusedSurfaceId);
    if (!record || !record.visible) {
      ownerWindow.webContents.focus();
      this.stats.focusedSurfaceId = null;
      return;
    }
    for (const [surfaceId, candidate] of this.records) {
      candidate.focused = surfaceId === focusedSurfaceId;
    }
    record.view.webContents.focus();
    this.stats.focusedSurfaceId = focusedSurfaceId;
  }

  private upsertLiveRecord(
    ownerWindow: OwnerWindow,
    workspaceId: string,
    update: NiriBrowserViewUpdate,
  ): void {
    const existing = this.records.get(update.surfaceId);
    const record = existing ?? this.createRecord(ownerWindow, workspaceId, update);
    if (!existing) {
      this.records.set(update.surfaceId, record);
    }

    if (record.url !== update.url) {
      record.url = update.url;
      void record.view.webContents.loadURL(update.url).catch((error: unknown) => {
        process.stderr.write(
          `failed to load niri browser pane ${update.surfaceId}: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
      });
    }
    record.paneId = update.paneId;
    record.title = update.title;
    record.workspaceId = workspaceId;
    record.visible = true;
    record.view.setVisible(true);

    const nextBounds = rectangleFromUpdate(update);
    if (!sameRectangle(record.bounds, nextBounds)) {
      record.view.setBounds(nextBounds);
      record.bounds = nextBounds;
      this.stats.boundsUpdateCount += 1;
    }
  }
}

export function createElectronWebContentsViewRegistry(): WebContentsViewRegistry {
  return new WebContentsViewRegistry({
    createView: () =>
      new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      }) as NativeBrowserView,
    windowFromIpcEvent: (event) =>
      BrowserWindow.fromWebContents(event.sender) as OwnerWindow | null,
  });
}

function decodeBatch(value: unknown): NiriBrowserViewBatch {
  const record = objectRecord(value, "NiriBrowserViewBatch");
  const updatesValue = record.updates;
  if (!Array.isArray(updatesValue)) {
    throw new Error("NiriBrowserViewBatch.updates must be an array");
  }
  return {
    focusedSurfaceId: nullableStringField(record, "focusedSurfaceId", "NiriBrowserViewBatch"),
    totalBrowserPanes: finiteNumberField(record, "totalBrowserPanes", "NiriBrowserViewBatch"),
    updates: updatesValue.map(decodeUpdate),
    visibleBrowserPanes: finiteNumberField(record, "visibleBrowserPanes", "NiriBrowserViewBatch"),
    workspaceId: stringField(record, "workspaceId", "NiriBrowserViewBatch"),
  };
}

function decodeUpdate(value: unknown): NiriBrowserViewUpdate {
  const record = objectRecord(value, "NiriBrowserViewUpdate");
  const runtimeState = stringField(record, "runtimeState", "NiriBrowserViewUpdate");
  if (
    runtimeState !== "destroyed" &&
    runtimeState !== "hidden" &&
    runtimeState !== "live" &&
    runtimeState !== "snapshot"
  ) {
    throw new Error("NiriBrowserViewUpdate.runtimeState is unsupported: " + runtimeState);
  }
  const url = stringField(record, "url", "NiriBrowserViewUpdate");
  assertSupportedURL(url);
  return {
    bounds: decodeBounds(record.bounds),
    focused: booleanField(record, "focused", "NiriBrowserViewUpdate"),
    paneId: stringField(record, "paneId", "NiriBrowserViewUpdate"),
    runtimeState,
    surfaceId: stringField(record, "surfaceId", "NiriBrowserViewUpdate"),
    title: stringField(record, "title", "NiriBrowserViewUpdate"),
    url,
    visible: booleanField(record, "visible", "NiriBrowserViewUpdate"),
  };
}

function decodeBounds(value: unknown): Rectangle {
  const record = objectRecord(value, "NiriBrowserViewBounds");
  return {
    height: Math.max(1, Math.round(finiteNumberField(record, "height", "NiriBrowserViewBounds"))),
    width: Math.max(1, Math.round(finiteNumberField(record, "width", "NiriBrowserViewBounds"))),
    x: Math.round(finiteNumberField(record, "x", "NiriBrowserViewBounds")),
    y: Math.round(finiteNumberField(record, "y", "NiriBrowserViewBounds")),
  };
}

function emptyStats(workspaceId: string | null): NiriBrowserViewStats {
  return {
    boundsBatchCount: 0,
    boundsUpdateCount: 0,
    destroyed: 0,
    focusedSurfaceId: null,
    hidden: 0,
    live: 0,
    registered: 0,
    teardownCount: 0,
    totalBrowserPanes: 0,
    visibleBrowserPanes: 0,
    workspaceId,
  };
}

function assertSupportedURL(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "data:" && parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("niri browser pane URL must use data, http, or https: " + url);
  }
}

function booleanField(record: Record<string, unknown>, field: string, label: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(label + "." + field + " must be a boolean");
  }
  return value;
}

function finiteNumberField(record: Record<string, unknown>, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(label + "." + field + " must be a finite number");
  }
  return value;
}

function isArrowKey(key: string): key is NiriBrowserViewKeyEvent["key"] {
  return key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp";
}

function nullableStringField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): string | null {
  const value = record[field];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(label + "." + field + " must be a string or null");
  }
  return value;
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  return value as Record<string, unknown>;
}

function rectangleFromUpdate(update: NiriBrowserViewUpdate): Rectangle {
  return {
    height: Math.max(1, Math.round(update.bounds.height)),
    width: Math.max(1, Math.round(update.bounds.width)),
    x: Math.round(update.bounds.x),
    y: Math.round(update.bounds.y),
  };
}

function sameRectangle(left: Rectangle, right: Rectangle): boolean {
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y
  );
}

function stringField(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(label + "." + field + " must be a string");
  }
  return value;
}
