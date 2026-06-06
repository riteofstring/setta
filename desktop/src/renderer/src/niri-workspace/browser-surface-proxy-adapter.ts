import type { NiriBrowserViewRuntimeState, NiriBrowserViewUpdate } from "@shared/types";

import type {
  FreezeReason,
  NiriPane,
  PaneSnapshot,
  Rect,
  ResumeReason,
  SurfaceAdapter,
  SurfaceKind,
  ViewportChangeReason,
} from "./types";

export interface BrowserViewUpdateQueue {
  queue(update: NiriBrowserViewUpdate): void;
}

export class BrowserSurfaceProxyAdapter implements SurfaceAdapter {
  readonly kind = "browser" satisfies SurfaceKind;

  private destroyed = false;
  private focused = false;
  private host: HTMLElement | null = null;
  private lastRect: Rect = { height: 1, width: 1, x: 0, y: 0 };
  private runtimeState: NiriBrowserViewRuntimeState = "hidden";
  private visible = false;

  constructor(
    private readonly pane: NiriPane,
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
    host.replaceChildren(renderBrowserProxyContent(host, this.pane));
    this.syncHostState();
    this.queueUpdate();
  }

  unmount(): void {
    this.visible = false;
    this.focused = false;
    this.runtimeState = "hidden";
    this.queueUpdate();
    this.host?.replaceChildren();
    this.host = null;
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
    if (this.host) {
      this.host.dataset.viewportReason = reason;
      this.host.dataset.surfaceViewport = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    }
    this.queueUpdate();
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
    this.runtimeState = "destroyed";
    this.visible = false;
    this.focused = false;
    this.queueUpdate();
    this.host?.replaceChildren();
    this.host = null;
    this.destroyed = true;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error(`browser surface ${this.surfaceId} has already been destroyed`);
    }
  }

  private queueUpdate(): void {
    const nativeBounds = this.nativeBounds();
    const update: NiriBrowserViewUpdate = {
      bounds: nativeBounds.rect,
      focused: this.focused,
      paneId: this.pane.paneId,
      runtimeState: this.runtimeState,
      surfaceId: this.surfaceId,
      title: this.pane.title,
      url: browserPaneURL(this.pane),
      visible: this.visible && this.runtimeState === "live",
    };
    this.batcher.queue(update);
  }

  private nativeBounds(): { rect: Rect; visible: boolean } {
    const workspace = this.host?.closest<HTMLElement>('[data-testid="niri-workspace-area"]');
    const workspaceBounds = workspace?.getBoundingClientRect();
    const unclipped = workspaceBounds
      ? {
          height: this.lastRect.height,
          width: this.lastRect.width,
          x: workspaceBounds.left + this.lastRect.x,
          y: workspaceBounds.top + this.lastRect.y,
        }
      : { ...this.lastRect };
    const rect = workspaceBounds ? intersectRects(unclipped, workspaceBounds) : unclipped;
    const visible = rect.width > 0 && rect.height > 0;
    return {
      rect: visible ? rect : { height: 1, width: 1, x: rect.x, y: rect.y },
      visible,
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

function browserPaneURL(pane: NiriPane): string {
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

function renderBrowserProxyContent(host: HTMLElement, pane: NiriPane): HTMLElement {
  const document = host.ownerDocument;
  const content = document.createElement("div");
  content.className = "niri-pane-content niri-browser-proxy-surface";

  const toolbar = document.createElement("div");
  toolbar.className = "niri-browser-proxy-toolbar";
  toolbar.textContent = `setta://browser/${pane.sequence}`;

  const title = document.createElement("h2");
  title.textContent = pane.title;

  const subtitle = document.createElement("p");
  subtitle.textContent = pane.subtitle;

  content.append(toolbar, title, subtitle);
  return content;
}
