import { BrowserSurfaceProxyAdapter } from "./browser-surface-proxy-adapter";
import { GitGraphSurfaceAdapter } from "./git-graph-surface-adapter";
import { createReactDomSurfaceAdapter } from "./react-dom-surface-adapter";
import { SyntheticTerminalSurfaceAdapter } from "./synthetic-terminal-surface-adapter";
import {
  cloneSnapshotNode,
  type EmptyFrameOption,
  renderEmptyFrameContent,
  renderFakeCanvasContent,
  renderFakePaneContent,
  renderSnapshotContent,
} from "./surface-dom-content";
import { TerminalSurfaceAdapter } from "./terminal-surface-adapter";
import type {
  FreezeReason,
  NiriPane,
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

export interface FrameLoop {
  cancelFrame(handle: number): void;
  requestFrame(callback: FrameRequestCallback): number;
}

export interface SnapshotSurfaceAdapterOptions {
  staticFallback?: boolean;
}

const browserFrameLoop: FrameLoop = {
  cancelFrame(handle) {
    if (typeof window !== "undefined") {
      window.cancelAnimationFrame(handle);
    }
  },
  requestFrame(callback) {
    if (typeof window === "undefined") {
      return 0;
    }
    return window.requestAnimationFrame(callback);
  },
};

export type EmptyFrameOptionsProvider = () => readonly EmptyFrameOption[];

class FakeDomSurfaceAdapter implements SurfaceAdapter {
  readonly kind: SurfaceKind = "fake-dom";
  protected host: HTMLElement | null = null;

  private destroyed = false;
  private focused = false;
  private frozen = false;
  private visible = false;

  constructor(protected readonly pane: NiriPane) {}

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
    pane: NiriPane,
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
  private focused = false;
  private host: HTMLElement | null = null;
  private texture: HTMLElement | null = null;
  private visible = false;

  constructor(
    private readonly pane: NiriPane,
    private readonly options: SnapshotSurfaceAdapterOptions = {},
  ) {}

  get surfaceId(): SurfaceId {
    return `${this.pane.surfaceId}:snapshot`;
  }

  captureTexture(sourceHost: HTMLElement): void {
    const document = sourceHost.ownerDocument;
    const texture = document.createElement("div");
    texture.className = "niri-snapshot-texture";
    for (const child of Array.from(sourceHost.children)) {
      if (child.classList.contains("niri-pane-maximize-button")) {
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
    host.replaceChildren(
      renderSnapshotContent(host, this.pane, this.texture, this.options.staticFallback ?? false),
    );
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
}

export class FakeCanvasSurfaceAdapter implements SurfaceAdapter {
  readonly kind = "fake-canvas" satisfies SurfaceKind;
  private canvas: HTMLCanvasElement | null = null;
  private destroyed = false;
  private focused = false;
  private frameHandle: number | null = null;
  private frozen = false;
  private host: HTMLElement | null = null;
  private visible = false;

  renderedFrameCount = 0;

  constructor(
    private readonly pane: NiriPane,
    private readonly frameLoop: FrameLoop = browserFrameLoop,
  ) {}

  get isRendering(): boolean {
    return this.frameHandle !== null;
  }

  get surfaceId(): SurfaceId {
    return this.pane.surfaceId;
  }

  mount(host: HTMLElement): void {
    this.ensureNotDestroyed();
    this.host = host;
    host.dataset.surfaceId = this.surfaceId;
    host.dataset.surfaceKind = this.kind;
    const content = renderFakeCanvasContent(host, this.pane);
    this.canvas = content.canvas;
    host.replaceChildren(content.root);
    this.syncHostState();
    this.updateLoop();
  }

  unmount(): void {
    this.stopLoop();
    this.host?.replaceChildren();
    this.canvas = null;
    this.host = null;
    this.visible = false;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncHostState();
    this.updateLoop();
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
    if (this.canvas) {
      this.canvas.width = Math.max(1, Math.floor(rect.width));
      this.canvas.height = Math.max(1, Math.floor(rect.height));
    }
  }

  freeze(reason: FreezeReason): void {
    this.frozen = true;
    this.host?.setAttribute("data-freeze-reason", reason);
    this.syncHostState();
    this.updateLoop();
  }

  resume(reason: ResumeReason): void {
    this.frozen = false;
    this.host?.setAttribute("data-resume-reason", reason);
    this.syncHostState();
    this.updateLoop();
  }

  captureSnapshot(): Promise<PaneSnapshot> {
    return Promise.resolve({
      capturedAt: performanceNow(),
      label: `${this.pane.title} canvas frame ${this.renderedFrameCount}`,
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

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error(`surface ${this.surfaceId} has already been destroyed`);
    }
  }

  private paint = (): void => {
    this.frameHandle = null;
    if (!this.visible || this.frozen || !this.host) {
      return;
    }
    this.renderedFrameCount += 1;
    this.paintCanvas();
    this.updateLoop();
  };

  private paintCanvas(): void {
    const context = this.canvas?.getContext("2d");
    if (!context || !this.canvas) {
      return;
    }
    const width = this.canvas.width;
    const height = this.canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(125, 211, 252, 0.16)";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(45, 212, 191, 0.42)";
    const offset = this.renderedFrameCount % Math.max(1, width);
    context.fillRect(offset, 0, 4, height);
  }

  private stopLoop(): void {
    if (this.frameHandle === null) {
      return;
    }
    this.frameLoop.cancelFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private syncHostState(): void {
    if (!this.host) {
      return;
    }
    this.host.dataset.surfaceFrozen = String(this.frozen);
    this.host.dataset.surfaceVisible = String(this.visible);
    this.host.dataset.surfaceFocused = String(this.focused);
    this.host.style.visibility = this.visible ? "visible" : "hidden";
  }

  private updateLoop(): void {
    if (!this.visible || this.frozen || !this.host) {
      this.stopLoop();
      return;
    }
    if (this.frameHandle === null) {
      this.frameHandle = this.frameLoop.requestFrame(this.paint);
    }
  }
}

export function createDefaultSurfaceAdapter(pane: NiriPane): SurfaceAdapter {
  return defaultSurfaceAdapterFactories[pane.surfaceKind](pane);
}

const defaultSurfaceAdapterFactories = {
  browser: (pane) => new BrowserSurfaceProxyAdapter(pane, noopBrowserViewQueue),
  "chat-dom": createReactDomSurfaceAdapter,
  "empty-frame": (pane) => new EmptyFrameSurfaceAdapter(pane),
  "fake-canvas": (pane) => new FakeCanvasSurfaceAdapter(pane),
  "fake-dom": (pane) => new FakeDomSurfaceAdapter(pane),
  "fake-heavy-dom": (pane) => new FakeHeavyDomSurfaceAdapter(pane),
  "fake-long-chat": createReactDomSurfaceAdapter,
  "fake-terminal": (pane) => new SyntheticTerminalSurfaceAdapter(pane),
  "git-graph": (pane) => new GitGraphSurfaceAdapter(pane),
  "pixi-canvas": createReactDomSurfaceAdapter,
  "settings-dom": createReactDomSurfaceAdapter,
  snapshot: (pane) => new SnapshotSurfaceAdapter(pane),
  terminal: (pane) => new TerminalSurfaceAdapter(pane),
  "workflow-node-details": createReactDomSurfaceAdapter,
  "workflow-settings": createReactDomSurfaceAdapter,
} satisfies Record<SurfaceKind, (pane: NiriPane) => SurfaceAdapter>;

function performanceNow(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}
