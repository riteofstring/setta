import { BrowserWindow, View, WebContentsView } from "electron";
import type { IpcMainEvent, Rectangle } from "electron";

import { decodeAppearanceMasterVoiceShortcut } from "@generated/backend";
import type { AppearanceMasterVoiceShortcut } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";
import { workspaceBrowserViewKeyValues } from "@shared/types";
import type {
  WorkspaceBrowserViewBatch,
  WorkspaceBrowserViewKey,
  WorkspaceBrowserViewKeyEvent,
  WorkspaceBrowserViewSnapshot,
  WorkspaceBrowserViewStats,
  WorkspaceBrowserViewUpdate,
} from "@shared/types";

interface NativeViewParent {
  addChildView(view: NativeView): void;
  removeChildView(view: NativeView): void;
}

interface OwnerWebContents {
  focus(): void;
  send(channel: string, payload: unknown): void;
}

interface OwnerWindow {
  contentView: NativeViewParent;
  isFocused(): boolean;
  webContents: OwnerWebContents;
}

interface NativeBrowserWebContents {
  capturePage(
    rect?: Rectangle,
    opts?: NativeBrowserCaptureOptions,
  ): Promise<NativeBrowserSnapshotImage>;
  close(): void;
  debugger: NativeBrowserWebContentsDebugger;
  focus(): void;
  isDestroyed(): boolean;
  loadURL(url: string): Promise<void>;
  on(event: "before-input-event", listener: BeforeInputListener): void;
  on(event: "did-finish-load", listener: LoadFinishedListener): void;
  removeListener(event: "before-input-event", listener: BeforeInputListener): void;
  removeListener(event: "did-finish-load", listener: LoadFinishedListener): void;
}

interface NativeBrowserSnapshotImage {
  toDataURL(): string;
}

interface NativeBrowserWebContentsDebugger {
  attach(protocolVersion?: string): void;
  detach(): void;
  isAttached(): boolean;
  sendCommand(method: string, commandParams?: unknown): Promise<unknown>;
}

interface NativeBrowserCaptureOptions {
  stayHidden?: boolean;
}

interface NativeView extends NativeViewParent {
  getBounds(): Rectangle;
  setBounds(bounds: Rectangle): void;
  setVisible(visible: boolean): void;
}

interface NativeBrowserView extends NativeView {
  webContents: NativeBrowserWebContents;
}

interface BeforeInputEvent {
  preventDefault(): void;
}

interface BeforeInput {
  alt: boolean;
  control?: boolean;
  key: string;
  meta: boolean;
  shift: boolean;
  type: string;
}

type BeforeInputListener = (event: BeforeInputEvent, input: BeforeInput) => void;
type LoadFinishedListener = () => void;

interface MasterVoiceModifierPattern {
  alt: boolean;
  control: boolean;
  meta: boolean;
}

interface BrowserViewRecord {
  bounds: Rectangle;
  clipView: NativeView;
  contentLoaded: boolean;
  contentBounds: Rectangle;
  focused: boolean;
  lastSnapshotKey: string | null;
  listener: BeforeInputListener;
  loadFinishedListener: LoadFinishedListener;
  loadingURL: string | null;
  masterVoiceShortcut: AppearanceMasterVoiceShortcut;
  parent: NativeViewParent;
  paneId: string;
  pendingSnapshotKey: string | null;
  snapshotInFlight: boolean;
  surfaceId: string;
  title: string;
  url: string;
  view: NativeBrowserView;
  visible: boolean;
  workspaceId: string;
}

interface WebContentsViewRegistryDependencies {
  createClipView: () => NativeView;
  createView: () => NativeBrowserView;
  windowFromIpcEvent: (event: IpcMainEvent) => OwnerWindow | null;
}

export class WebContentsViewRegistry {
  private readonly records = new Map<string, BrowserViewRecord>();
  private routedFocusedSurfaceId: string | null = null;
  private stats: WorkspaceBrowserViewStats = emptyStats(null);

  constructor(private readonly dependencies: WebContentsViewRegistryDependencies) {}

  applyBatch(event: IpcMainEvent, rawBatch: unknown): WorkspaceBrowserViewStats {
    const batch = decodeBatch(rawBatch);
    const ownerWindow = this.requireOwnerWindow(event);
    this.stats.boundsBatchCount += 1;
    this.stats.totalBrowserPanes = batch.totalBrowserPanes;
    this.stats.visibleBrowserPanes = batch.visibleBrowserPanes;
    this.stats.workspaceId = batch.workspaceId;
    this.syncWorkspaceMasterVoiceShortcut(batch.workspaceId, batch.masterVoiceShortcut);

    for (const update of batch.updates) {
      if (update.runtimeState === "destroyed") {
        this.destroyRecord(update.surfaceId);
        continue;
      }
      if (!update.visible || update.runtimeState !== "live") {
        this.hideRecord(update.surfaceId);
        continue;
      }
      this.upsertLiveRecord(ownerWindow, batch.workspaceId, batch.masterVoiceShortcut, update);
    }

    this.routeFocus(ownerWindow, batch.focusedSurfaceId);
    this.recount();
    return this.readStats();
  }

  readStats(): WorkspaceBrowserViewStats {
    this.recount();
    return { ...this.stats };
  }

  teardownAll(): WorkspaceBrowserViewStats {
    for (const surfaceId of [...this.records.keys()]) {
      this.destroyRecord(surfaceId);
    }
    this.stats.focusedSurfaceId = null;
    this.routedFocusedSurfaceId = null;
    this.stats.teardownCount += 1;
    this.stats.workspaceId = null;
    this.recount();
    return this.readStats();
  }

  teardownWorkspace(workspaceId: string): WorkspaceBrowserViewStats {
    for (const [surfaceId, record] of this.records) {
      if (record.workspaceId === workspaceId) {
        this.destroyRecord(surfaceId);
      }
    }
    if (this.stats.workspaceId === workspaceId) {
      this.stats.focusedSurfaceId = null;
      this.stats.workspaceId = null;
    }
    this.routedFocusedSurfaceId = null;
    this.stats.teardownCount += 1;
    this.recount();
    return this.readStats();
  }

  private createRecord(
    ownerWindow: OwnerWindow,
    workspaceId: string,
    masterVoiceShortcut: AppearanceMasterVoiceShortcut,
    update: WorkspaceBrowserViewUpdate,
  ): BrowserViewRecord {
    const clipView = this.dependencies.createClipView();
    const view = this.dependencies.createView();
    const recordHolder: { record: BrowserViewRecord | null } = { record: null };
    const listener: BeforeInputListener = (event, input) => {
      const activeRecord = recordHolder.record;
      if (!activeRecord) {
        throw new Error("workspace browser view input arrived before record registration");
      }
      const keyEvent = workspaceBrowserViewKeyEventFromInput(
        input,
        activeRecord.surfaceId,
        activeRecord.workspaceId,
        activeRecord.masterVoiceShortcut,
      );
      if (!keyEvent) {
        return;
      }
      event.preventDefault();
      ownerWindow.webContents.send(ipcEvents.workspaceBrowserViewKey, keyEvent);
    };
    const loadFinishedListener: LoadFinishedListener = () => {
      const loadedRecord = recordHolder.record;
      if (!loadedRecord) {
        throw new Error("workspace browser view finished loading before record registration");
      }
      this.markRecordLoaded(ownerWindow, update.surfaceId, loadedRecord, null);
    };
    const bounds = rectangleFromUpdate(update);
    const contentBounds = contentRectangleFromUpdate(update);
    const record = {
      bounds,
      clipView,
      contentLoaded: false,
      contentBounds,
      focused: false,
      lastSnapshotKey: null,
      listener,
      loadFinishedListener,
      loadingURL: null,
      masterVoiceShortcut,
      parent: ownerWindow.contentView,
      paneId: update.paneId,
      pendingSnapshotKey: null,
      snapshotInFlight: false,
      surfaceId: update.surfaceId,
      title: update.title,
      url: update.url,
      view,
      visible: true,
      workspaceId,
    } satisfies BrowserViewRecord;
    recordHolder.record = record;
    view.webContents.on("before-input-event", listener);
    view.webContents.on("did-finish-load", loadFinishedListener);
    clipView.addChildView(view);
    ownerWindow.contentView.addChildView(clipView);
    clipView.setBounds(bounds);
    clipView.setVisible(true);
    view.setBounds(childRectangleForBounds(bounds, contentBounds));
    view.setVisible(true);
    return record;
  }

  private destroyRecord(surfaceId: string): void {
    const record = this.records.get(surfaceId);
    if (!record) {
      return;
    }
    record.view.setVisible(false);
    record.clipView.setVisible(false);
    record.view.webContents.removeListener("before-input-event", record.listener);
    record.view.webContents.removeListener("did-finish-load", record.loadFinishedListener);
    record.clipView.removeChildView(record.view);
    record.parent.removeChildView(record.clipView);
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
    record.clipView.setVisible(false);
    record.visible = false;
    record.focused = false;
    if (this.stats.focusedSurfaceId === surfaceId) {
      this.stats.focusedSurfaceId = null;
    }
  }

  private recount(): void {
    let contentLoaded = 0;
    let hidden = 0;
    let live = 0;
    let loading = 0;
    let snapshotsInFlight = 0;
    for (const record of this.records.values()) {
      if (record.visible) {
        live += 1;
      } else {
        hidden += 1;
      }
      if (record.contentLoaded) {
        contentLoaded += 1;
      }
      if (record.loadingURL !== null) {
        loading += 1;
      }
      if (record.snapshotInFlight) {
        snapshotsInFlight += 1;
      }
    }
    this.stats.contentLoaded = contentLoaded;
    this.stats.hidden = hidden;
    this.stats.live = live;
    this.stats.loading = loading;
    this.stats.registered = this.records.size;
    this.stats.snapshotsInFlight = snapshotsInFlight;
    this.stats.visibleBrowserPanes = live;
  }

  private requireOwnerWindow(event: IpcMainEvent): OwnerWindow {
    const ownerWindow = this.dependencies.windowFromIpcEvent(event);
    if (!ownerWindow) {
      throw new Error("workspace browser view batch has no owning BrowserWindow");
    }
    return ownerWindow;
  }

  private routeFocus(ownerWindow: OwnerWindow, focusedSurfaceId: string | null): void {
    if (!focusedSurfaceId) {
      this.clearRoutedFocus(ownerWindow);
      return;
    }
    const record = this.records.get(focusedSurfaceId);
    if (!record || !record.visible) {
      this.clearRoutedFocus(ownerWindow);
      return;
    }
    for (const [surfaceId, candidate] of this.records) {
      candidate.focused = surfaceId === focusedSurfaceId;
    }
    this.stats.focusedSurfaceId = focusedSurfaceId;
    if (this.routedFocusedSurfaceId !== focusedSurfaceId && ownerWindow.isFocused()) {
      record.view.webContents.focus();
      this.routedFocusedSurfaceId = focusedSurfaceId;
    }
  }

  private clearRoutedFocus(ownerWindow: OwnerWindow): void {
    this.stats.focusedSurfaceId = null;
    for (const record of this.records.values()) {
      record.focused = false;
    }
    if (this.routedFocusedSurfaceId && ownerWindow.isFocused()) {
      ownerWindow.webContents.focus();
      this.routedFocusedSurfaceId = null;
    }
  }

  private syncWorkspaceMasterVoiceShortcut(
    workspaceId: string,
    shortcut: AppearanceMasterVoiceShortcut,
  ): void {
    for (const record of this.records.values()) {
      if (record.workspaceId === workspaceId) {
        record.masterVoiceShortcut = shortcut;
      }
    }
  }

  private upsertLiveRecord(
    ownerWindow: OwnerWindow,
    workspaceId: string,
    masterVoiceShortcut: AppearanceMasterVoiceShortcut,
    update: WorkspaceBrowserViewUpdate,
  ): void {
    const existing = this.records.get(update.surfaceId);
    const record =
      existing ?? this.createRecord(ownerWindow, workspaceId, masterVoiceShortcut, update);
    if (!existing) {
      this.records.set(update.surfaceId, record);
    }

    if (record.url !== update.url || (!record.contentLoaded && record.loadingURL === null)) {
      this.loadRecordURL(ownerWindow, update.surfaceId, record, update.url);
    }
    record.paneId = update.paneId;
    record.title = update.title;
    record.workspaceId = workspaceId;
    record.masterVoiceShortcut = masterVoiceShortcut;
    record.visible = true;
    record.clipView.setVisible(true);
    record.view.setVisible(true);

    const nextBounds = rectangleFromUpdate(update);
    const nextContentBounds = contentRectangleFromUpdate(update);
    if (!sameRectangle(record.bounds, nextBounds)) {
      record.clipView.setBounds(nextBounds);
      record.bounds = nextBounds;
      this.stats.boundsUpdateCount += 1;
    }
    if (!sameRectangle(record.contentBounds, nextContentBounds)) {
      record.contentBounds = nextContentBounds;
    }
    const nextChildBounds = childRectangleForBounds(nextBounds, nextContentBounds);
    if (!sameRectangle(record.view.getBounds(), nextChildBounds)) {
      record.view.setBounds(nextChildBounds);
    }
    this.scheduleSnapshot(ownerWindow, update.surfaceId, record, false);
  }

  private loadRecordURL(
    ownerWindow: OwnerWindow,
    surfaceId: string,
    record: BrowserViewRecord,
    url: string,
  ): void {
    record.url = url;
    record.contentLoaded = false;
    record.lastSnapshotKey = null;
    record.loadingURL = url;
    record.pendingSnapshotKey = null;
    void record.view.webContents
      .loadURL(url)
      .then(() => {
        this.markRecordLoaded(ownerWindow, surfaceId, record, url);
      })
      .catch((error: unknown) => {
        const current = this.records.get(surfaceId);
        if (current !== record || record.loadingURL !== url) {
          return;
        }
        record.loadingURL = null;
        if (!record.visible) {
          return;
        }
        process.stderr.write(
          `failed to load workspace browser pane ${surfaceId}: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
      });
  }

  private markRecordLoaded(
    ownerWindow: OwnerWindow,
    surfaceId: string,
    record: BrowserViewRecord,
    url: string | null,
  ): void {
    const current = this.records.get(surfaceId);
    if (current !== record || record.loadingURL === null) {
      return;
    }
    if (url !== null && record.loadingURL !== url) {
      return;
    }
    record.contentLoaded = true;
    record.loadingURL = null;
    this.scheduleSnapshot(ownerWindow, surfaceId, record, true);
  }

  private scheduleSnapshot(
    ownerWindow: OwnerWindow,
    surfaceId: string,
    record: BrowserViewRecord,
    force: boolean,
  ): void {
    if (
      !record.contentLoaded ||
      !record.visible ||
      record.contentBounds.width <= 1 ||
      record.contentBounds.height <= 1
    ) {
      return;
    }
    const snapshotKey = browserSnapshotKey(record);
    if (!force && record.lastSnapshotKey === snapshotKey) {
      return;
    }
    if (record.snapshotInFlight) {
      record.pendingSnapshotKey = snapshotKey;
      return;
    }
    record.snapshotInFlight = true;
    this.stats.snapshotCapturesStarted += 1;
    record.pendingSnapshotKey = snapshotKey;
    const capturedBounds = { ...record.contentBounds };
    const capturedPaneId = record.paneId;
    const capturedTitle = record.title;
    const capturedWorkspaceId = record.workspaceId;
    void captureNativeBrowserSnapshot(record.view.webContents, capturedBounds, () => {
      const current = this.records.get(surfaceId);
      return current === record && record.visible;
    })
      .then((image) => {
        const current = this.records.get(surfaceId);
        if (current !== record) {
          return;
        }
        record.lastSnapshotKey = snapshotKey;
        this.stats.snapshotCaptureLastError = null;
        this.stats.snapshotCapturesSucceeded += 1;
        ownerWindow.webContents.send(ipcEvents.workspaceBrowserViewSnapshot, {
          capturedAt: Date.now(),
          height: capturedBounds.height,
          imageDataUrl: image.toDataURL(),
          paneId: capturedPaneId,
          surfaceId,
          title: capturedTitle,
          width: capturedBounds.width,
          workspaceId: capturedWorkspaceId,
        } satisfies WorkspaceBrowserViewSnapshot);
      })
      .catch((error: unknown) => {
        const current = this.records.get(surfaceId);
        if (current === record) {
          record.lastSnapshotKey = snapshotKey;
          this.stats.snapshotCaptureLastError = captureErrorMessage(error);
          this.stats.snapshotCapturesFailed += 1;
        }
        if (current !== record || !record.visible || isExpectedTransientCaptureFailure(error)) {
          return;
        }
        process.stderr.write(
          `failed to capture workspace browser pane ${surfaceId}: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
      })
      .finally(() => {
        const current = this.records.get(surfaceId);
        if (current !== record) {
          return;
        }
        record.snapshotInFlight = false;
        const pendingSnapshotKey = record.pendingSnapshotKey;
        record.pendingSnapshotKey = null;
        if (pendingSnapshotKey && pendingSnapshotKey !== record.lastSnapshotKey) {
          this.scheduleSnapshot(ownerWindow, surfaceId, record, true);
        }
      });
  }
}

function nativeBrowserSnapshotRect(bounds: Rectangle): Rectangle {
  return {
    height: bounds.height,
    width: bounds.width,
    x: 0,
    y: 0,
  };
}

function captureNativeBrowserSnapshot(
  webContents: NativeBrowserWebContents,
  bounds: Rectangle,
  shouldRetryAfterTransientFailure: () => boolean,
): Promise<NativeBrowserSnapshotImage> {
  return webContents
    .capturePage(nativeBrowserSnapshotRect(bounds), { stayHidden: true })
    .catch((error: unknown) => {
      if (!isExpectedTransientCaptureFailure(error) || !shouldRetryAfterTransientFailure()) {
        throw error;
      }
      return webContents.capturePage(undefined, { stayHidden: true }).catch((fallbackError) => {
        if (
          !isExpectedTransientCaptureFailure(fallbackError) ||
          !shouldRetryAfterTransientFailure()
        ) {
          throw fallbackError;
        }
        return captureNativeBrowserSnapshotWithDebugger(webContents, bounds);
      });
    });
}

async function captureNativeBrowserSnapshotWithDebugger(
  webContents: NativeBrowserWebContents,
  bounds: Rectangle,
): Promise<NativeBrowserSnapshotImage> {
  const debuggerApi = webContents.debugger;
  const wasAttached = debuggerApi.isAttached();
  if (!wasAttached) {
    debuggerApi.attach("1.3");
  }
  try {
    const response = await debuggerApi.sendCommand("Page.captureScreenshot", {
      captureBeyondViewport: true,
      clip: {
        height: bounds.height,
        scale: 1,
        width: bounds.width,
        x: 0,
        y: 0,
      },
      format: "png",
      fromSurface: false,
      optimizeForSpeed: true,
    });
    const imageData = debuggerScreenshotData(response);
    return {
      toDataURL() {
        return `data:image/png;base64,${imageData}`;
      },
    };
  } finally {
    if (!wasAttached && debuggerApi.isAttached()) {
      debuggerApi.detach();
    }
  }
}

function debuggerScreenshotData(response: unknown): string {
  const record = objectRecord(response, "Page.captureScreenshot result");
  const data = record.data;
  if (typeof data !== "string" || data.length === 0) {
    throw new Error("Page.captureScreenshot result.data must be a non-empty string");
  }
  return data;
}

function isExpectedTransientCaptureFailure(error: unknown): boolean {
  return captureErrorMessage(error).includes("Current display surface not available for capture");
}

function captureErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyStats(workspaceId: string | null): WorkspaceBrowserViewStats {
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
    teardownCount: 0,
    totalBrowserPanes: 0,
    visibleBrowserPanes: 0,
    workspaceId,
  };
}

export function createElectronWebContentsViewRegistry(): WebContentsViewRegistry {
  return new WebContentsViewRegistry({
    createClipView: () => new View() as NativeView,
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

function decodeBatch(value: unknown): WorkspaceBrowserViewBatch {
  const record = objectRecord(value, "WorkspaceBrowserViewBatch");
  const updatesValue = record.updates;
  if (!Array.isArray(updatesValue)) {
    throw new Error("WorkspaceBrowserViewBatch.updates must be an array");
  }
  return {
    focusedSurfaceId: nullableStringField(record, "focusedSurfaceId", "WorkspaceBrowserViewBatch"),
    masterVoiceShortcut: decodeAppearanceMasterVoiceShortcut(
      record.masterVoiceShortcut,
      "WorkspaceBrowserViewBatch.masterVoiceShortcut",
    ),
    totalBrowserPanes: finiteNumberField(record, "totalBrowserPanes", "WorkspaceBrowserViewBatch"),
    updates: updatesValue.map(decodeUpdate),
    visibleBrowserPanes: finiteNumberField(
      record,
      "visibleBrowserPanes",
      "WorkspaceBrowserViewBatch",
    ),
    workspaceId: stringField(record, "workspaceId", "WorkspaceBrowserViewBatch"),
  };
}

function decodeUpdate(value: unknown): WorkspaceBrowserViewUpdate {
  const record = objectRecord(value, "WorkspaceBrowserViewUpdate");
  const runtimeState = stringField(record, "runtimeState", "WorkspaceBrowserViewUpdate");
  if (
    runtimeState !== "destroyed" &&
    runtimeState !== "hidden" &&
    runtimeState !== "live" &&
    runtimeState !== "snapshot"
  ) {
    throw new Error("WorkspaceBrowserViewUpdate.runtimeState is unsupported: " + runtimeState);
  }
  const url = stringField(record, "url", "WorkspaceBrowserViewUpdate");
  assertSupportedURL(url);
  return {
    bounds: decodeBounds(record.bounds),
    contentBounds: decodeBounds(record.contentBounds),
    focused: booleanField(record, "focused", "WorkspaceBrowserViewUpdate"),
    paneId: stringField(record, "paneId", "WorkspaceBrowserViewUpdate"),
    runtimeState,
    surfaceId: stringField(record, "surfaceId", "WorkspaceBrowserViewUpdate"),
    title: stringField(record, "title", "WorkspaceBrowserViewUpdate"),
    url,
    visible: booleanField(record, "visible", "WorkspaceBrowserViewUpdate"),
  };
}

function decodeBounds(value: unknown): Rectangle {
  const record = objectRecord(value, "WorkspaceBrowserViewBounds");
  return {
    height: Math.max(
      1,
      Math.round(finiteNumberField(record, "height", "WorkspaceBrowserViewBounds")),
    ),
    width: Math.max(
      1,
      Math.round(finiteNumberField(record, "width", "WorkspaceBrowserViewBounds")),
    ),
    x: Math.round(finiteNumberField(record, "x", "WorkspaceBrowserViewBounds")),
    y: Math.round(finiteNumberField(record, "y", "WorkspaceBrowserViewBounds")),
  };
}

function assertSupportedURL(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "data:" && parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("workspace browser pane URL must use data, http, or https: " + url);
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

function isArrowKey(key: string): key is WorkspaceBrowserViewKey {
  return key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp";
}

const browserViewCommandKeys = new Set<string>(workspaceBrowserViewKeyValues);

function isBrowserViewCommandKey(key: string): key is WorkspaceBrowserViewKey {
  return browserViewCommandKeys.has(key);
}

function workspaceBrowserViewKeyEventFromInput(
  input: BeforeInput,
  surfaceId: string,
  workspaceId: string,
  masterVoiceShortcut: AppearanceMasterVoiceShortcut,
): WorkspaceBrowserViewKeyEvent | null {
  if (input.type !== "keyDown") {
    return null;
  }
  const key = normalizeBrowserViewInputKey(input.key);
  const ctrlKey = input.control ?? false;
  const workspaceModifier = input.alt && (input.meta || ctrlKey);
  if (!shouldForwardWorkspaceBrowserViewKey(input, key, workspaceModifier, masterVoiceShortcut)) {
    return null;
  }
  return {
    altKey: input.alt,
    ctrlKey,
    key,
    metaKey: input.meta,
    shiftKey: input.shift,
    surfaceId,
    workspaceId,
  };
}

function shouldForwardWorkspaceBrowserViewKey(
  input: BeforeInput,
  key: string,
  workspaceModifier: boolean,
  masterVoiceShortcut: AppearanceMasterVoiceShortcut,
): key is WorkspaceBrowserViewKey {
  if (isArrowKey(key)) {
    return workspaceModifier;
  }
  if (key === "Enter" && workspaceModifier) {
    return true;
  }
  if (key === "k") {
    return shouldForwardMasterKeyShortcut(input, masterVoiceShortcut);
  }
  return input.meta && isBrowserViewCommandKey(key);
}

function shouldForwardMasterKeyShortcut(
  input: BeforeInput,
  masterVoiceShortcut: AppearanceMasterVoiceShortcut,
): boolean {
  return (
    isMasterOverlayShortcutInput(input) ||
    isConfiguredMasterVoiceShortcutInput(input, masterVoiceShortcut)
  );
}

function isMasterOverlayShortcutInput(input: BeforeInput): boolean {
  return !input.alt && !input.shift && (input.meta || Boolean(input.control));
}

function isConfiguredMasterVoiceShortcutInput(
  input: BeforeInput,
  shortcut: AppearanceMasterVoiceShortcut,
): boolean {
  const pattern = masterVoiceModifierPattern(shortcut);
  return input.shift && masterVoiceModifierMatches(input, pattern);
}

function masterVoiceModifierPattern(
  shortcut: AppearanceMasterVoiceShortcut,
): MasterVoiceModifierPattern {
  switch (shortcut) {
    case "mod_shift_k":
      return process.platform === "darwin"
        ? { alt: false, control: false, meta: true }
        : { alt: false, control: true, meta: false };
    case "ctrl_shift_k":
      return { alt: false, control: true, meta: false };
    case "alt_shift_k":
      return { alt: true, control: false, meta: false };
    default:
      return assertNever(shortcut);
  }
}

function masterVoiceModifierMatches(
  input: BeforeInput,
  pattern: MasterVoiceModifierPattern,
): boolean {
  return (
    input.alt === pattern.alt &&
    Boolean(input.control) === pattern.control &&
    input.meta === pattern.meta
  );
}

function normalizeBrowserViewInputKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
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

function assertNever(value: never): never {
  throw new Error(`Unsupported workspace browser view value: ${JSON.stringify(value)}`);
}

function rectangleFromUpdate(update: WorkspaceBrowserViewUpdate): Rectangle {
  return {
    height: Math.max(1, Math.round(update.bounds.height)),
    width: Math.max(1, Math.round(update.bounds.width)),
    x: Math.round(update.bounds.x),
    y: Math.round(update.bounds.y),
  };
}

function contentRectangleFromUpdate(update: WorkspaceBrowserViewUpdate): Rectangle {
  return {
    height: Math.max(1, Math.round(update.contentBounds.height)),
    width: Math.max(1, Math.round(update.contentBounds.width)),
    x: Math.round(update.contentBounds.x),
    y: Math.round(update.contentBounds.y),
  };
}

function childRectangleForBounds(bounds: Rectangle, contentBounds: Rectangle): Rectangle {
  return {
    height: contentBounds.height,
    width: contentBounds.width,
    x: contentBounds.x - bounds.x,
    y: contentBounds.y - bounds.y,
  };
}

function browserSnapshotKey(record: BrowserViewRecord): string {
  return [
    record.workspaceId,
    record.surfaceId,
    record.url,
    record.contentBounds.width,
    record.contentBounds.height,
  ].join(":");
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
