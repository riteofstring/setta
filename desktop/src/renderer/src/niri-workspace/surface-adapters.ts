import { BrowserSurfaceProxyAdapter } from "./browser-surface-proxy-adapter";
import { GitGraphSurfaceAdapter } from "./git-graph-surface-adapter";
import { createReactDomSurfaceAdapter } from "./react-dom-surface-adapter";
import {
  cloneSnapshotNode,
  type EmptyFrameOption,
  renderEmptyFrameContent,
  renderFakeCanvasContent,
  renderFakePaneContent,
  renderPixiCanvasContent,
  renderSnapshotContent,
} from "./surface-dom-content";
import { TerminalSurfaceAdapter } from "./terminal-surface-adapter";
import type {
  CanvasSurfaceStats,
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

export class PixiCanvasSurfaceAdapter implements SurfaceAdapter {
  readonly kind = "pixi-canvas" satisfies SurfaceKind;
  private canvas: HTMLCanvasElement | null = null;
  private destroyed = false;
  private drawCalls = 0;
  private focused = false;
  private frameHandle: number | null = null;
  private frozen = false;
  private gpuMemoryEstimateBytes: number | null = null;
  private host: HTMLElement | null = null;
  private lastCanvasHeight = 0;
  private lastCanvasWidth = 0;
  private panX = 0;
  private panY = 0;
  private renderedFrames = 0;
  private simplified = false;
  private visible = false;
  private zoom = 1;

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
    const content = renderPixiCanvasContent(host, this.pane);
    this.canvas = content.canvas;
    host.replaceChildren(content.root);
    host.addEventListener("pointerdown", this.handlePointerDown);
    host.addEventListener("pointermove", this.handlePointerMove);
    host.addEventListener("pointerup", this.handlePointerUp);
    host.addEventListener("pointercancel", this.handlePointerUp);
    host.addEventListener("wheel", this.handleWheel, { passive: false });
    this.syncHostState();
    this.updateLoop();
  }

  unmount(): void {
    this.stopLoop();
    this.host?.removeEventListener("pointerdown", this.handlePointerDown);
    this.host?.removeEventListener("pointermove", this.handlePointerMove);
    this.host?.removeEventListener("pointerup", this.handlePointerUp);
    this.host?.removeEventListener("pointercancel", this.handlePointerUp);
    this.host?.removeEventListener("wheel", this.handleWheel);
    this.host?.replaceChildren();
    this.canvas = null;
    this.host = null;
    this.visible = false;
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return;
    }
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
    this.resizeCanvas(rect);
    this.updateGpuMemoryEstimate();
  }

  freeze(reason: FreezeReason): void {
    if (this.frozen) {
      this.host?.setAttribute("data-freeze-reason", reason);
      return;
    }
    this.frozen = true;
    this.host?.setAttribute("data-freeze-reason", reason);
    this.syncHostState();
    this.updateLoop();
  }

  resume(reason: ResumeReason): void {
    if (!this.frozen) {
      this.host?.setAttribute("data-resume-reason", reason);
      return;
    }
    this.frozen = false;
    this.host?.setAttribute("data-resume-reason", reason);
    this.syncHostState();
    this.updateLoop();
  }

  captureSnapshot(): Promise<PaneSnapshot> {
    return Promise.resolve({
      capturedAt: performanceNow(),
      label: `${this.pane.title} canvas frame ${this.renderedFrames}`,
      surfaceId: this.surfaceId,
    });
  }

  getCanvasStats(): CanvasSurfaceStats {
    return {
      drawCalls: this.visible && !this.frozen ? this.drawCalls : 0,
      farZoomSimplified: this.simplified,
      gpuMemoryEstimateBytes: this.gpuMemoryEstimateBytes,
      liveCanvasPaneCount: this.visible && !this.frozen && this.host ? 1 : 0,
      renderedFrames: this.renderedFrames,
    };
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

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.host) {
      return;
    }
    this.host.setPointerCapture(event.pointerId);
    this.host.dataset.canvasDragging = "true";
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.host || this.host.dataset.canvasDragging !== "true") {
      return;
    }
    this.panX += event.movementX;
    this.panY += event.movementY;
    this.requestPaint();
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.host) {
      return;
    }
    if (this.host.hasPointerCapture(event.pointerId)) {
      this.host.releasePointerCapture(event.pointerId);
    }
    this.host.dataset.canvasDragging = "false";
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const nextZoom = this.zoom * (event.deltaY > 0 ? 0.9 : 1.1);
    this.zoom = Math.min(3, Math.max(0.18, nextZoom));
    this.requestPaint();
  };

  private paint = (): void => {
    this.frameHandle = null;
    if (!this.visible || this.frozen || !this.host) {
      return;
    }
    this.renderedFrames += 1;
    this.paintCanvas();
  };

  private paintCanvas(): void {
    const context = this.canvas?.getContext("2d");
    if (!context || !this.canvas) {
      return;
    }
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.simplified = this.zoom < 0.35;
    this.drawCalls = this.simplified ? 3 : 8;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(13, 18, 24, 0.92)";
    context.fillRect(0, 0, width, height);
    context.save();
    context.translate(width / 2 + this.panX, height / 2 + this.panY);
    context.scale(this.zoom, this.zoom);

    if (this.simplified) {
      this.paintSimplifiedWorld(context);
    } else {
      this.paintDetailedWorld(context);
    }

    context.restore();
    this.syncHostState();
  }

  private paintDetailedWorld(context: CanvasRenderingContext2D): void {
    context.strokeStyle = "rgba(148, 163, 184, 0.18)";
    context.lineWidth = 1;
    for (let line = -360; line <= 360; line += 120) {
      context.beginPath();
      context.moveTo(line, -260);
      context.lineTo(line, 260);
      context.moveTo(-520, line);
      context.lineTo(520, line);
      context.stroke();
    }
    for (let index = 0; index < 12; index += 1) {
      const x = -420 + (index % 6) * 150;
      const y = -170 + Math.floor(index / 6) * 180;
      context.fillStyle =
        index % 3 === 0 ? "rgba(45, 212, 191, 0.36)" : "rgba(125, 211, 252, 0.24)";
      context.fillRect(x, y, 78, 54);
      context.fillStyle = "rgba(226, 232, 240, 0.58)";
      context.fillRect(x + 10, y + 12, 42 + (index % 4) * 6, 5);
      context.fillRect(x + 10, y + 26, 34 + (index % 5) * 7, 5);
    }
  }

  private paintSimplifiedWorld(context: CanvasRenderingContext2D): void {
    context.fillStyle = "rgba(45, 212, 191, 0.2)";
    context.fillRect(-520, -240, 320, 180);
    context.fillStyle = "rgba(125, 211, 252, 0.18)";
    context.fillRect(-120, -210, 260, 320);
    context.fillStyle = "rgba(244, 114, 182, 0.18)";
    context.fillRect(220, -120, 300, 220);
  }

  private requestPaint(): void {
    if (!this.visible || this.frozen || !this.host || this.frameHandle !== null) {
      return;
    }
    this.frameHandle = this.frameLoop.requestFrame(this.paint);
  }

  private resizeCanvas(rect: Rect): void {
    if (!this.canvas) {
      return;
    }
    const ratio = pixelRatio();
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    if (this.lastCanvasWidth === width && this.lastCanvasHeight === height) {
      return;
    }
    this.lastCanvasWidth = width;
    this.lastCanvasHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.requestPaint();
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
    this.host.dataset.canvasDrawCalls = String(this.visible && !this.frozen ? this.drawCalls : 0);
    this.host.dataset.canvasFrames = String(this.renderedFrames);
    this.host.dataset.canvasSimplified = String(this.simplified);
    this.host.dataset.canvasZoom = this.zoom.toFixed(2);
    this.host.style.visibility = this.visible ? "visible" : "hidden";
  }

  private updateGpuMemoryEstimate(): void {
    if (!this.canvas) {
      this.gpuMemoryEstimateBytes = null;
      return;
    }
    this.gpuMemoryEstimateBytes = this.canvas.width * this.canvas.height * 4;
  }

  private updateLoop(): void {
    if (!this.visible || this.frozen || !this.host) {
      this.stopLoop();
      return;
    }
    this.requestPaint();
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
  "git-graph": (pane) => new GitGraphSurfaceAdapter(pane),
  "pixi-canvas": (pane) => new PixiCanvasSurfaceAdapter(pane),
  "settings-dom": createReactDomSurfaceAdapter,
  snapshot: (pane) => new SnapshotSurfaceAdapter(pane),
  terminal: (pane) => new TerminalSurfaceAdapter(pane),
} satisfies Record<SurfaceKind, (pane: NiriPane) => SurfaceAdapter>;

function performanceNow(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}

function pixelRatio(): number {
  if (typeof window === "undefined") {
    return 1;
  }
  return Math.max(1, Math.min(2, window.devicePixelRatio || 1));
}
