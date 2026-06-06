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

export interface FrameLoop {
  cancelFrame(handle: number): void;
  requestFrame(callback: FrameRequestCallback): number;
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
  private visible = false;

  constructor(private readonly pane: NiriPane) {}

  get surfaceId(): SurfaceId {
    return `${this.pane.surfaceId}:snapshot`;
  }

  mount(host: HTMLElement): void {
    this.host = host;
    host.dataset.surfaceId = this.surfaceId;
    host.dataset.surfaceKind = this.kind;
    host.replaceChildren(renderSnapshotContent(host, this.pane));
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

export function createFakeSurfaceAdapter(pane: NiriPane): SurfaceAdapter {
  switch (pane.surfaceKind) {
    case "fake-canvas":
      return new FakeCanvasSurfaceAdapter(pane);
    case "fake-dom":
      return new FakeDomSurfaceAdapter(pane);
    case "fake-heavy-dom":
      return new FakeHeavyDomSurfaceAdapter(pane);
    case "snapshot":
      return new SnapshotSurfaceAdapter(pane);
    default:
      assertNever(pane.surfaceKind);
  }
}

function renderFakePaneContent(host: HTMLElement, pane: NiriPane, rowCount: number): HTMLElement {
  const document = host.ownerDocument;
  const content = document.createElement("div");
  content.className = "niri-pane-content";
  content.dataset.niriSurfaceContent = "true";

  const header = document.createElement("div");
  header.className = "niri-pane-header";

  const index = document.createElement("span");
  index.className = "niri-pane-index";
  index.dataset.niriPaneIndex = "";
  index.textContent = String(pane.sequence + 1);

  const titleBlock = document.createElement("div");
  titleBlock.className = "min-w-0";

  const title = document.createElement("h2");
  title.dataset.niriPaneTitle = "";
  title.textContent = pane.title;

  const subtitle = document.createElement("p");
  subtitle.dataset.niriPaneSubtitle = "";
  subtitle.textContent = pane.subtitle;

  titleBlock.append(title, subtitle);
  header.append(index, titleBlock);

  const meter = document.createElement("div");
  meter.className = "niri-pane-meter";
  const meterLabel = document.createElement("span");
  meterLabel.textContent = pane.surfaceKind === "fake-heavy-dom" ? "heavy" : "load";
  const meterValue = document.createElement("strong");
  meterValue.dataset.niriPaneHeat = "";
  meterValue.textContent = `${pane.heat}%`;
  meter.append(meterLabel, meterValue);

  const rows = document.createElement("div");
  rows.className = "niri-pane-rows";
  rows.setAttribute("aria-hidden", "true");
  const boundedRowCount = Math.max(1, rowCount);
  for (let index = 0; index < boundedRowCount; index += 1) {
    const row = document.createElement("span");
    row.style.width = `${46 + ((pane.sequence + index * 7) % 48)}%`;
    rows.append(row);
  }

  content.append(header, meter, rows);
  return content;
}

function renderFakeCanvasContent(
  host: HTMLElement,
  pane: NiriPane,
): { canvas: HTMLCanvasElement; root: HTMLElement } {
  const document = host.ownerDocument;
  const root = document.createElement("div");
  root.className = "niri-pane-content niri-canvas-surface";

  const header = document.createElement("div");
  header.className = "niri-pane-header";
  const index = document.createElement("span");
  index.className = "niri-pane-index";
  index.textContent = String(pane.sequence + 1);
  const titleBlock = document.createElement("div");
  titleBlock.className = "min-w-0";
  const title = document.createElement("h2");
  title.textContent = pane.title;
  const subtitle = document.createElement("p");
  subtitle.textContent = "fake canvas renderer";
  titleBlock.append(title, subtitle);
  header.append(index, titleBlock);

  const canvas = document.createElement("canvas");
  canvas.className = "niri-fake-canvas";
  canvas.setAttribute("aria-hidden", "true");

  root.append(header, canvas);
  return { canvas, root };
}

function renderSnapshotContent(host: HTMLElement, pane: NiriPane): HTMLElement {
  const document = host.ownerDocument;
  const content = document.createElement("div");
  content.className = "niri-pane-content niri-snapshot-surface";
  const label = document.createElement("div");
  label.className = "niri-snapshot-label";
  label.textContent = pane.title;
  const state = document.createElement("div");
  state.className = "niri-snapshot-state";
  state.textContent = "snapshot";
  content.append(label, state);
  return content;
}

function performanceNow(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}

function assertNever(value: never): never {
  throw new Error(`Unhandled niri surface kind: ${String(value)}`);
}
