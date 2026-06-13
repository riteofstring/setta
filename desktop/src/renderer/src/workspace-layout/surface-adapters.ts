import type { SyntheticWorkflowGraphOptions } from "../features/workspace-graph/workflow-graph-camera-scope";
import { BrowserSurfaceProxyAdapter } from "./browser-surface-proxy-adapter";
import { GitGraphSurfaceAdapter } from "./git-graph-surface-adapter";
import { createReactDomSurfaceAdapter } from "./react-dom-surface-adapter";
import { SyntheticTerminalSurfaceAdapter } from "./synthetic-terminal-surface-adapter";
import {
  applySnapshotScrollOffsets,
  cloneSnapshotNode,
  type EmptyFrameOption,
  renderEmptyFrameContent,
  renderFakePaneContent,
  renderSnapshotContent,
} from "./surface-dom-content";
import { TerminalSurfaceAdapter } from "./terminal-surface-adapter";
import type {
  FreezeReason,
  WorkspacePane,
  PaneSnapshot,
  Rect,
  ResumeReason,
  SurfaceAdapter,
  SurfaceId,
  SurfaceKind,
  ViewportChangeReason,
} from "./types";

export type { EmptyFrameOption } from "./surface-dom-content";

const noopBrowserViewQueue = {
  queue() {},
};

export interface SnapshotSurfaceAdapterOptions {
  staticFallback?: boolean;
}

export interface DefaultSurfaceAdapterOptions {
  workflowGraphSyntheticGraphFallback?: SyntheticWorkflowGraphOptions;
}

export type EmptyFrameOptionsProvider = () => readonly EmptyFrameOption[];

type RendererCaptureRegion = { height: number; width: number; x: number; y: number };
type RendererCaptureApi = NonNullable<Window["setta"]>["app"]["captureRendererRegion"];

interface BitmapCaptureRequest {
  captureKey: string;
  captureRegion: RendererCaptureRegion;
}

class FakeDomSurfaceAdapter implements SurfaceAdapter {
  readonly kind: SurfaceKind = "fake-dom";
  protected host: HTMLElement | null = null;

  private destroyed = false;
  private focused = false;
  private frozen = false;
  private visible = false;

  constructor(protected readonly pane: WorkspacePane) {}

  get lifecycleState() {
    return {
      destroyed: this.destroyed,
      focused: this.focused,
      frozen: this.frozen,
      mounted: this.host !== null,
      visible: this.visible,
    };
  }

  get surfaceId(): SurfaceId {
    return this.pane.surfaceId;
  }

  mount(host: HTMLElement): void {
    this.ensureNotDestroyed();
    this.host = host;
    host.dataset.surfaceId = this.surfaceId;
    host.dataset.surfaceKind = this.kind;
    host.replaceChildren(renderFakePaneContent(host, this.pane, 4));
    this.syncHostState();
  }

  unmount(): void {
    this.host?.replaceChildren();
    this.host = null;
    this.visible = false;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncHostState();
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.syncHostState();
  }

  setViewport(rect: Rect, reason: ViewportChangeReason): void {
    if (!this.host) {
      return;
    }
    this.host.dataset.viewportReason = reason;
    this.host.dataset.surfaceViewport = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
  }

  freeze(reason: FreezeReason): void {
    this.frozen = true;
    this.host?.setAttribute("data-freeze-reason", reason);
    this.syncHostState();
  }

  resume(reason: ResumeReason): void {
    this.frozen = false;
    this.host?.setAttribute("data-resume-reason", reason);
    this.syncHostState();
  }

  captureSnapshot(): Promise<PaneSnapshot> {
    return Promise.resolve({
      capturedAt: performanceNow(),
      label: this.pane.title,
      surfaceId: this.surfaceId,
    });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.unmount();
    this.destroyed = true;
  }

  protected ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error(`surface ${this.surfaceId} has already been destroyed`);
    }
  }

  protected syncHostState(): void {
    if (!this.host) {
      return;
    }
    this.host.dataset.surfaceFrozen = String(this.frozen);
    this.host.dataset.surfaceVisible = String(this.visible);
    this.host.dataset.surfaceFocused = String(this.focused);
    this.host.style.visibility = this.visible ? "visible" : "hidden";
  }
}

export class EmptyFrameSurfaceAdapter extends FakeDomSurfaceAdapter {
  override readonly kind = "empty-frame" satisfies SurfaceKind;

  constructor(
    pane: WorkspacePane,
    private readonly optionsProvider: EmptyFrameOptionsProvider = () => [],
  ) {
    super(pane);
  }

  override mount(host: HTMLElement): void {
    this.ensureNotDestroyed();
    this.host = host;
    host.dataset.surfaceId = this.surfaceId;
    host.dataset.surfaceKind = this.kind;
    host.replaceChildren(renderEmptyFrameContent(host, this.pane, this.optionsProvider()));
    this.syncHostState();
  }
}

export class FakeHeavyDomSurfaceAdapter extends FakeDomSurfaceAdapter {
  override readonly kind = "fake-heavy-dom" satisfies SurfaceKind;

  override mount(host: HTMLElement): void {
    this.ensureNotDestroyed();
    this.host = host;
    host.dataset.surfaceId = this.surfaceId;
    host.dataset.surfaceKind = this.kind;
    host.replaceChildren(renderFakePaneContent(host, this.pane, 72));
    this.syncHostState();
  }
}

export class SnapshotSurfaceAdapter implements SurfaceAdapter {
  readonly kind = "snapshot" satisfies SurfaceKind;
  private bitmapCaptureKey: string | null = null;
  private bitmapCapturePendingKey: string | null = null;
  private bitmapTexture: HTMLElement | null = null;
  private focused = false;
  private host: HTMLElement | null = null;
  private texture: HTMLElement | null = null;
  private textureCaptureKey: string | null = null;
  private visible = false;

  constructor(
    private readonly pane: WorkspacePane,
    private readonly options: SnapshotSurfaceAdapterOptions = {},
  ) {}

  get surfaceId(): SurfaceId {
    return `${this.pane.surfaceId}:snapshot`;
  }

  captureBitmap(sourceHost: HTMLElement): void {
    const request = bitmapCaptureRequestForHost(sourceHost);
    if (!request || this.bitmapCaptureRequested(request.captureKey)) {
      return;
    }
    const captureApi = rendererRegionCaptureApi();
    if (!captureApi) {
      return;
    }
    this.bitmapCapturePendingKey = request.captureKey;
    void captureApi(request.captureRegion)
      .then((snapshot) => {
        this.applyCapturedBitmap(sourceHost, request.captureKey, snapshot);
      })
      .catch((error: unknown) => {
        this.handleBitmapCaptureFailure(request.captureKey, error);
      });
  }

  captureTexture(sourceHost: HTMLElement): void {
    this.bitmapCapturePendingKey = null;
    const capture = rendererRegionCaptureForHost(sourceHost);
    const captureRegion = rendererCaptureRegionForElement(capture?.source ?? null);
    this.textureCaptureKey =
      capture && captureRegion ? rendererCaptureKey(capture.source, captureRegion) : null;
    const document = sourceHost.ownerDocument;
    const texture = document.createElement("div");
    texture.className = "workspace-snapshot-texture";
    for (const child of Array.from(sourceHost.children)) {
      if (child.classList.contains("workspace-pane-top-bar")) {
        continue;
      }
      texture.append(cloneSnapshotNode(child, document));
    }
    if (texture.childElementCount > 0) {
      this.texture = texture;
    }
  }

  mount(host: HTMLElement): void {
    this.host = host;
    host.dataset.surfaceId = this.surfaceId;
    host.dataset.surfaceKind = this.kind;
    this.rerenderMountedSnapshot();
    applySnapshotScrollOffsets(host);
    this.syncHostState();
  }

  unmount(): void {
    this.host?.replaceChildren();
    this.host = null;
    this.visible = false;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncHostState();
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.syncHostState();
  }

  setViewport(rect: Rect, reason: ViewportChangeReason): void {
    if (!this.host) {
      return;
    }
    this.host.dataset.viewportReason = reason;
    this.host.dataset.surfaceViewport = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
  }

  freeze(): void {}

  resume(): void {}

  destroy(): void {
    this.unmount();
  }

  private syncHostState(): void {
    if (!this.host) {
      return;
    }
    this.host.dataset.surfaceVisible = String(this.visible);
    this.host.dataset.surfaceFocused = String(this.focused);
    this.host.style.visibility = this.visible ? "visible" : "hidden";
  }

  private rerenderMountedSnapshot(): void {
    if (!this.host) {
      return;
    }
    const texture =
      this.bitmapTexture && this.bitmapCaptureKey === this.textureCaptureKey
        ? this.bitmapTexture
        : this.texture;
    this.host.replaceChildren(
      renderSnapshotContent(this.host, this.pane, texture, this.options.staticFallback ?? false),
    );
    applySnapshotScrollOffsets(this.host);
  }

  private bitmapCaptureRequested(captureKey: string): boolean {
    return this.bitmapCaptureKey === captureKey || this.bitmapCapturePendingKey === captureKey;
  }

  private applyCapturedBitmap(
    sourceHost: HTMLElement,
    captureKey: string,
    snapshot: Awaited<ReturnType<RendererCaptureApi>>,
  ): void {
    if (this.bitmapCapturePendingKey !== captureKey) {
      return;
    }
    this.bitmapCapturePendingKey = null;
    this.bitmapCaptureKey = captureKey;
    this.bitmapTexture = renderBitmapSnapshotTexture(
      sourceHost.ownerDocument,
      snapshot,
      captureKey,
    );
    this.rerenderMountedSnapshot();
  }

  private handleBitmapCaptureFailure(captureKey: string, error: unknown): void {
    if (this.bitmapCapturePendingKey !== captureKey) {
      return;
    }
    this.bitmapCapturePendingKey = null;
    console.warn(
      "failed to capture workspace DOM pane bitmap snapshot",
      error instanceof Error ? error.message : error,
    );
  }
}

function bitmapCaptureRequestForHost(sourceHost: HTMLElement): BitmapCaptureRequest | null {
  const capture = rendererRegionCaptureForHost(sourceHost);
  const captureRegion = rendererCaptureRegionForElement(capture?.source ?? null);
  if (!capture || !captureRegion) {
    return null;
  }
  return {
    captureKey: rendererCaptureKey(capture.source, captureRegion),
    captureRegion,
  };
}

function rendererRegionCaptureApi(): RendererCaptureApi | null {
  return typeof window === "undefined" ? null : (window.setta?.app.captureRendererRegion ?? null);
}

function rendererRegionCaptureForHost(sourceHost: HTMLElement): { source: HTMLElement } | null {
  for (const child of Array.from(sourceHost.children)) {
    if (child.classList.contains("workspace-pane-top-bar")) {
      continue;
    }
    if (isElementWithLayout(child)) {
      return { source: child };
    }
  }
  return null;
}

function rendererCaptureRegionForElement(source: HTMLElement | null): RendererCaptureRegion | null {
  if (!source) {
    return null;
  }
  const rect = source.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width <= 1 || height <= 1) {
    return null;
  }
  return {
    height,
    width,
    x: Math.round(rect.left),
    y: Math.round(rect.top),
  };
}

function rendererCaptureKey(
  source: HTMLElement,
  region: { height: number; width: number },
): string {
  return [
    source.dataset.surfaceViewport ?? "",
    region.width,
    region.height,
    snapshotScrollKey(source),
  ].join(":");
}

function snapshotScrollKey(root: Element): string {
  if (typeof root.querySelectorAll !== "function") {
    return "";
  }
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      [
        "[data-snapshot-scroller='true']",
        "[data-testid='chat-transcript-scroller']",
        ".overflow-auto",
        ".overflow-y-auto",
        ".workspace-fake-long-chat-scroll",
      ].join(","),
    ),
  )
    .map((element) => `${Math.round(element.scrollTop)},${Math.round(element.scrollLeft)}`)
    .join("|");
}

function isElementWithLayout(element: Element): element is HTMLElement {
  return (
    "getBoundingClientRect" in element &&
    "dataset" in element &&
    "ownerDocument" in element &&
    "style" in element
  );
}

function renderBitmapSnapshotTexture(
  document: Document,
  snapshot: { height: number; imageDataUrl: string; width: number },
  captureKey: string,
): HTMLElement {
  const texture = document.createElement("div");
  texture.className = "workspace-snapshot-texture workspace-snapshot-bitmap-texture";
  texture.dataset.snapshotCaptureKey = captureKey;
  const image = document.createElement("img");
  image.alt = "";
  image.className = "workspace-snapshot-bitmap";
  image.decoding = "async";
  image.draggable = false;
  image.height = snapshot.height;
  image.src = snapshot.imageDataUrl;
  image.width = snapshot.width;
  texture.append(image);
  return texture;
}

export function createDefaultSurfaceAdapter(
  pane: WorkspacePane,
  options: DefaultSurfaceAdapterOptions = {},
): SurfaceAdapter {
  return defaultSurfaceAdapterFactories[pane.surfaceKind](pane, options);
}

const defaultSurfaceAdapterFactories = {
  browser: (pane) => new BrowserSurfaceProxyAdapter(pane, noopBrowserViewQueue),
  "chat-dom": (pane) => createReactDomSurfaceAdapter(pane),
  "empty-frame": (pane) => new EmptyFrameSurfaceAdapter(pane),
  "fake-dom": (pane) => new FakeDomSurfaceAdapter(pane),
  "fake-heavy-dom": (pane) => new FakeHeavyDomSurfaceAdapter(pane),
  "fake-long-chat": (pane) => createReactDomSurfaceAdapter(pane),
  "fake-terminal": (pane) => new SyntheticTerminalSurfaceAdapter(pane),
  "git-graph": (pane) => new GitGraphSurfaceAdapter(pane),
  "workflow-graph": (pane, options) =>
    createReactDomSurfaceAdapter(pane, undefined, {
      workflowGraphSyntheticGraphFallback: options.workflowGraphSyntheticGraphFallback,
    }),
  "settings-dom": (pane) => createReactDomSurfaceAdapter(pane),
  snapshot: (pane) => new SnapshotSurfaceAdapter(pane),
  terminal: (pane) => new TerminalSurfaceAdapter(pane),
  "workflow-node-details": (pane) => createReactDomSurfaceAdapter(pane),
  "workflow-settings": (pane) => createReactDomSurfaceAdapter(pane),
} satisfies Record<
  SurfaceKind,
  (pane: WorkspacePane, options: DefaultSurfaceAdapterOptions) => SurfaceAdapter
>;

function performanceNow(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}
