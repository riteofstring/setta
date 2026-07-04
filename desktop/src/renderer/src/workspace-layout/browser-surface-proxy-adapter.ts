import type {
  WorkspaceBrowserViewRuntimeState,
  WorkspaceBrowserViewSnapshot,
  WorkspaceBrowserViewUpdate,
} from "@shared/types";

import type {
  FreezeReason,
  WorkspacePane,
  PaneSnapshot,
  Rect,
  ResumeReason,
  SurfaceAdapter,
  SurfaceKind,
  ViewportChangeReason,
} from "./types";

export interface BrowserViewUpdateQueue {
  queue(update: WorkspaceBrowserViewUpdate): void;
}

const nativePaneControlStripPx = 30;

export class BrowserSurfaceProxyAdapter implements SurfaceAdapter {
  readonly kind = "browser" satisfies SurfaceKind;

  private destroyed = false;
  private focused = false;
  private hasViewport = false;
  private host: HTMLElement | null = null;
  private lastRect: Rect = { height: 1, width: 1, x: 0, y: 0 };
  private runtimeState: WorkspaceBrowserViewRuntimeState = "hidden";
  private snapshotContent: HTMLElement | null = null;
  private snapshotImage: HTMLImageElement | null = null;
  private unsubscribeSnapshot: (() => void) | null = null;
  private visible = false;

  constructor(
    private readonly pane: WorkspacePane,
    private readonly batcher: BrowserViewUpdateQueue,
  ) {}

  get surfaceId(): string {
    return this.pane.surfaceId;
  }

  mount(host: HTMLElement): void {
    this.ensureNotDestroyed();
    this.host = host;
    host.dataset.surfaceId = this.surfaceId;
    host.dataset.surfaceKind = this.kind;
    const content = renderBrowserProxyContent(host, this.pane);
    this.snapshotContent = content;
    this.snapshotImage = content.querySelector<HTMLImageElement>(
      "[data-workspace-browser-snapshot]",
    );
    host.replaceChildren(content);
    this.subscribeToSnapshots();
    this.syncHostState();
    this.queueUpdate();
  }

  unmount(): void {
    this.unsubscribeFromSnapshots();
    this.visible = false;
    this.focused = false;
    this.runtimeState = "hidden";
    this.queueUpdate();
    this.host?.replaceChildren();
    this.host = null;
    this.snapshotContent = null;
    this.snapshotImage = null;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.queueUpdate();
    this.syncHostState();
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.queueUpdate();
    this.syncHostState();
  }

  setViewport(rect: Rect, reason: ViewportChangeReason): void {
    this.lastRect = rect;
    this.hasViewport = true;
    if (this.host) {
      this.host.dataset.viewportReason = reason;
      this.host.dataset.surfaceViewport = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    }
    this.syncSnapshotSize();
    this.queueUpdate();
  }

  syncFrame(): void {
    this.syncSnapshotSize();
    if (this.runtimeState === "live") {
      this.queueUpdate();
    }
  }

  freeze(reason: FreezeReason): void {
    this.runtimeState =
      reason === "snapshot" || reason === "runtime-policy" ? "snapshot" : "hidden";
    this.host?.setAttribute("data-freeze-reason", reason);
    this.queueUpdate();
    this.syncHostState();
  }

  resume(reason: ResumeReason): void {
    this.runtimeState = "live";
    this.host?.setAttribute("data-resume-reason", reason);
    this.queueUpdate();
    this.syncHostState();
  }

  captureSnapshot(): Promise<PaneSnapshot> {
    return Promise.resolve({
      capturedAt: performanceNow(),
      label: `${this.pane.title} browser snapshot`,
      surfaceId: this.surfaceId,
    });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.unsubscribeFromSnapshots();
    this.runtimeState = "destroyed";
    this.visible = false;
    this.focused = false;
    this.queueUpdate();
    this.host?.replaceChildren();
    this.host = null;
    this.snapshotContent = null;
    this.snapshotImage = null;
    this.destroyed = true;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error(`browser surface ${this.surfaceId} has already been destroyed`);
    }
  }

  private queueUpdate(): void {
    const nativeBounds = this.nativeBounds();
    const update: WorkspaceBrowserViewUpdate = {
      bounds: nativeBounds.rect,
      contentBounds: nativeBounds.contentRect,
      focused: this.focused,
      paneId: this.pane.paneId,
      runtimeState: this.runtimeState,
      surfaceId: this.surfaceId,
      title: this.pane.title,
      url: browserPaneURL(this.pane),
      visible: this.visible && this.runtimeState === "live" && nativeBounds.visible,
    };
    this.batcher.queue(update);
  }

  private subscribeToSnapshots(): void {
    this.unsubscribeFromSnapshots();
    const bridge = typeof window === "undefined" ? null : window.setta?.workspaceNativeViews;
    this.unsubscribeSnapshot =
      bridge?.onBrowserViewSnapshot((snapshot) => {
        if (snapshot.surfaceId === this.surfaceId) {
          this.applySnapshot(snapshot);
        }
      }) ?? null;
  }

  private unsubscribeFromSnapshots(): void {
    this.unsubscribeSnapshot?.();
    this.unsubscribeSnapshot = null;
  }

  private applySnapshot(snapshot: WorkspaceBrowserViewSnapshot): void {
    const image = this.snapshotImage;
    const content = this.snapshotContent;
    if (!image || !content) {
      return;
    }
    image.width = Math.max(1, Math.round(snapshot.width));
    image.height = Math.max(1, Math.round(snapshot.height));
    if (!snapshotSizeMatchesNativeBounds(image, this.nativePaneContentSize())) {
      this.hideSnapshot();
      return;
    }
    image.src = snapshot.imageDataUrl;
    image.hidden = false;
    content.dataset.browserSnapshotReady = "true";
    this.host?.setAttribute("data-browser-snapshot-captured-at", String(snapshot.capturedAt));
  }

  private syncSnapshotSize(): void {
    const image = this.snapshotImage;
    if (!image || image.hidden) {
      return;
    }
    if (!snapshotSizeMatchesNativeBounds(image, this.nativePaneContentSize())) {
      this.hideSnapshot();
    }
  }

  private hideSnapshot(): void {
    if (this.snapshotImage) {
      this.snapshotImage.hidden = true;
    }
    if (this.snapshotContent) {
      delete this.snapshotContent.dataset.browserSnapshotReady;
    }
    this.host?.removeAttribute("data-browser-snapshot-captured-at");
  }

  private nativeBounds(): { contentRect: Rect; rect: Rect; visible: boolean } {
    const nativeRect = this.nativePaneRect();
    const clipBounds = this.host
      ?.closest<HTMLElement>('[data-testid="workspace-presentation-engine"]')
      ?.getBoundingClientRect();
    const visibleRect = clipBounds ? intersectRects(nativeRect, clipBounds) : nativeRect;
    const visible = visibleRect.width > 0 && visibleRect.height > 0;
    return {
      contentRect: nativeRect,
      rect: visible ? visibleRect : { height: 1, width: 1, x: nativeRect.x, y: nativeRect.y },
      visible,
    };
  }

  private nativePaneRect(): Rect {
    const hostBounds = this.host?.getBoundingClientRect();
    const unclipped = hostBounds
      ? {
          height: hostBounds.height,
          width: hostBounds.width,
          x: hostBounds.left,
          y: hostBounds.top,
        }
      : { ...this.lastRect };
    const nativeRect = {
      ...unclipped,
      height: Math.max(1, unclipped.height - nativePaneControlStripPx),
      width: Math.max(1, unclipped.width),
      y: unclipped.y + nativePaneControlStripPx,
    };
    return nativeRect;
  }

  private nativePaneContentSize(): Pick<Rect, "height" | "width"> {
    if (!this.hasViewport) {
      return this.nativePaneRect();
    }
    return {
      height: Math.max(1, this.lastRect.height - nativePaneControlStripPx),
      width: Math.max(1, this.lastRect.width),
    };
  }

  private syncHostState(): void {
    if (!this.host) {
      return;
    }
    this.host.dataset.surfaceFocused = String(this.focused);
    this.host.dataset.surfaceVisible = String(this.visible);
    this.host.dataset.browserRuntimeState = this.runtimeState;
    this.host.style.visibility = this.visible ? "visible" : "hidden";
  }
}

function intersectRects(subject: Rect, clip: DOMRect): Rect {
  const x = Math.max(subject.x, clip.left);
  const y = Math.max(subject.y, clip.top);
  const right = Math.min(subject.x + subject.width, clip.right);
  const bottom = Math.min(subject.y + subject.height, clip.bottom);
  return {
    height: Math.max(0, bottom - y),
    width: Math.max(0, right - x),
    x,
    y,
  };
}

function snapshotSizeMatchesNativeBounds(
  image: HTMLImageElement,
  nativeSize: Pick<Rect, "height" | "width">,
): boolean {
  return (
    image.width === Math.max(1, Math.round(nativeSize.width)) &&
    image.height === Math.max(1, Math.round(nativeSize.height))
  );
}

function browserPaneURL(pane: WorkspacePane): string {
  const title = escapeHTML(pane.title);
  const subtitle = escapeHTML(pane.subtitle);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f172a;color:#dbeafe;}
main{box-sizing:border-box;min-height:100vh;padding:18px;background:linear-gradient(135deg,#0f172a,#164e63);}
.bar{height:24px;border-radius:6px;background:#e0f2fe;color:#0f172a;display:flex;align-items:center;padding:0 10px;font-size:11px;}
h1{font-size:16px;margin:16px 0 6px;}p{margin:0;color:#bae6fd;line-height:1.45}.row{height:8px;margin-top:14px;border-radius:999px;background:#38bdf8;}
</style><title>${title}</title></head><body><main><div class="bar">setta://browser/${pane.sequence}</div><h1>${title}</h1><p>${subtitle}</p><div class="row" style="width:82%"></div><div class="row" style="width:64%"></div><div class="row" style="width:72%"></div></main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function performanceNow(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}

function renderBrowserProxyContent(host: HTMLElement, pane: WorkspacePane): HTMLElement {
  const document = host.ownerDocument;
  const content = document.createElement("div");
  content.className = "workspace-pane-content workspace-browser-proxy-surface";

  const snapshot = document.createElement("img");
  snapshot.alt = "";
  snapshot.className = "workspace-browser-proxy-snapshot";
  snapshot.dataset.workspaceBrowserSnapshot = "true";
  snapshot.decoding = "async";
  snapshot.draggable = false;
  snapshot.hidden = true;

  const fallback = document.createElement("div");
  fallback.className = "workspace-browser-proxy-fallback";

  const toolbar = document.createElement("div");
  toolbar.className = "workspace-browser-proxy-toolbar";
  toolbar.textContent = `setta://browser/${pane.sequence}`;

  const title = document.createElement("h2");
  title.textContent = pane.title;

  const subtitle = document.createElement("p");
  subtitle.textContent = pane.subtitle;

  const rowOne = document.createElement("div");
  rowOne.className = "workspace-browser-proxy-row";
  rowOne.style.width = "82%";

  const rowTwo = document.createElement("div");
  rowTwo.className = "workspace-browser-proxy-row";
  rowTwo.style.width = "64%";

  const rowThree = document.createElement("div");
  rowThree.className = "workspace-browser-proxy-row";
  rowThree.style.width = "72%";

  fallback.append(toolbar, title, subtitle, rowOne, rowTwo, rowThree);
  content.append(snapshot, fallback);
  return content;
}
