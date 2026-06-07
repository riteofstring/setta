import type { SyntheticWorkflowGraphOptions } from "../features/workspace-graph/workflow-graph-camera-scope";
import { BrowserSurfaceProxyAdapter } from "./browser-surface-proxy-adapter";
import { GitGraphSurfaceAdapter } from "./git-graph-surface-adapter";
import { createReactDomSurfaceAdapter } from "./react-dom-surface-adapter";
import { SyntheticTerminalSurfaceAdapter } from "./synthetic-terminal-surface-adapter";
import {
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
  private focused = false;
  private host: HTMLElement | null = null;
  private texture: HTMLElement | null = null;
  private visible = false;

  constructor(
    private readonly pane: WorkspacePane,
    private readonly options: SnapshotSurfaceAdapterOptions = {},
  ) {}

  get surfaceId(): SurfaceId {
    return `${this.pane.surfaceId}:snapshot`;
  }

  captureTexture(sourceHost: HTMLElement): void {
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
  "semantic-node-details": (pane) => createReactDomSurfaceAdapter(pane),
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
