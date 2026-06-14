import type { ReactNode } from "react";
import { createRoot as createReactRoot, type Root } from "react-dom/client";

import { WorkflowGraphSurface } from "../features/workspace-graph/workflow-graph-surface";
import type { SyntheticWorkflowGraphOptions } from "../features/workspace-graph/workflow-graph-camera-scope";
import { WorkflowNodeDetailsSurface } from "../features/workspace-graph/workflow-node-details-surface";
import { WorkflowSettingsSurface } from "../features/workspace-graph/workflow-settings-surface";
import {
  FakeLongChatSurface,
  WorkspaceChatSurface,
  WorkspaceSettingsSurface,
} from "./workspace-dom-surfaces";
import { applySnapshotScrollOffsets, recordSnapshotScrollOffsets } from "./surface-dom-content";
import type {
  CanvasSurfaceStats,
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

export interface ReactSurfaceRoot {
  render(node: ReactNode): void;
  unmount(): void;
}

export interface ReactSurfaceRootFactory {
  createRoot(container: HTMLElement): ReactSurfaceRoot;
}

export interface ReactDomSurfaceState {
  activated: boolean;
  focused: boolean;
}

export interface ReactDomSurfaceAdapterOptions {
  workflowGraphSyntheticGraphFallback?: SyntheticWorkflowGraphOptions;
}

const defaultRootFactory: ReactSurfaceRootFactory = {
  createRoot(container) {
    return createReactRoot(container) satisfies Root;
  },
};

export class ReactDomSurfaceAdapter implements SurfaceAdapter {
  readonly kind: SurfaceKind;
  private container: HTMLElement | null = null;
  private destroyed = false;
  private focused = false;
  private frozen = false;
  private host: HTMLElement | null = null;
  private root: ReactSurfaceRoot | null = null;
  private activated = false;
  private scrollbarSuppressionToken = 0;
  private visible = false;

  constructor(
    private readonly pane: WorkspacePane,
    private readonly renderSurface: (state: ReactDomSurfaceState) => ReactNode,
    private readonly rootFactory: ReactSurfaceRootFactory = defaultRootFactory,
  ) {
    this.kind = pane.surfaceKind;
  }

  get lifecycleState() {
    return {
      activated: this.activated,
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
    if (this.host && this.host !== host) {
      this.unmount();
    }
    this.host = host;
    if (!this.container) {
      this.container = host.ownerDocument.createElement("div");
      this.container.className = "workspace-react-dom-surface";
      this.container.dataset.reactSurfaceKind = this.kind;
    }
    host.dataset.surfaceId = this.surfaceId;
    host.dataset.surfaceKind = this.kind;
    host.replaceChildren(this.container);
    this.restoreParkedScrollOffsets();
    if (!this.root) {
      this.root = this.rootFactory.createRoot(this.container);
      this.renderCurrentSurface();
    }
    this.syncHostState();
  }

  unmount(): void {
    if (this.container) {
      recordSnapshotScrollOffsets(this.container);
    }
    this.host?.replaceChildren();
    this.host = null;
    this.visible = false;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncHostState();
  }

  setFocused(focused: boolean): void {
    if (focused) {
      this.activated = true;
    }
    if (this.focused === focused) {
      return;
    }
    this.focused = focused;
    this.renderCurrentSurface();
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
    const wasFrozen = this.frozen;
    this.frozen = false;
    this.host?.setAttribute("data-resume-reason", reason);
    if (wasFrozen) {
      this.suppressLiveScrollbars();
    }
    this.syncHostState();
  }

  captureSnapshot(): Promise<PaneSnapshot> {
    return Promise.resolve({
      capturedAt: performanceNow(),
      label: this.pane.title,
      surfaceId: this.surfaceId,
    });
  }

  getCanvasStats(): CanvasSurfaceStats {
    if (this.kind !== "workflow-graph") {
      return emptyCanvasStats();
    }
    const snapshot = workflowGraphDebugSnapshot(this.surfaceId);
    return {
      drawCalls: 0,
      farZoomSimplified: false,
      gpuMemoryEstimateBytes: null,
      liveCanvasPaneCount: this.visible && !this.frozen && this.host ? 1 : 0,
      renderedFrames: snapshot?.render.frameCount ?? 0,
    };
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    const root = this.root;
    this.root = null;
    this.unmount();
    this.container = null;
    if (root) {
      deferReactRootUnmount(root);
    }
    this.destroyed = true;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error(`react DOM surface ${this.surfaceId} has already been destroyed`);
    }
  }

  private syncHostState(): void {
    if (!this.host) {
      return;
    }
    this.host.dataset.surfaceFocused = String(this.focused);
    this.host.dataset.surfaceFrozen = String(this.frozen);
    this.host.dataset.surfaceVisible = String(this.visible);
    this.host.style.visibility = this.visible ? "visible" : "hidden";
    if (this.container) {
      this.container.dataset.focused = String(this.focused);
      this.container.dataset.frozen = String(this.frozen);
      this.container.dataset.visible = String(this.visible);
    }
  }

  private renderCurrentSurface(): void {
    this.root?.render(
      this.renderSurface({
        activated: this.activated,
        focused: this.focused,
      }),
    );
  }

  private restoreParkedScrollOffsets(): void {
    const container = this.container;
    if (!container) {
      return;
    }
    applySnapshotScrollOffsets(container);
    restoreScrollOffsetsAcrossFrames(container, 24);
  }

  private suppressLiveScrollbars(): void {
    const container = this.container;
    if (!container) {
      return;
    }
    this.scrollbarSuppressionToken += 1;
    const token = this.scrollbarSuppressionToken;
    container.dataset.scrollbarsSuppressed = "true";
    clearScrollbarsSuppressedAcrossFrames(
      container,
      token,
      () => this.scrollbarSuppressionToken,
      18,
    );
  }
}

function restoreScrollOffsetsAcrossFrames(root: Element, remainingFrames: number): void {
  if (remainingFrames <= 0) {
    return;
  }
  const restore = () => {
    applySnapshotScrollOffsets(root);
    restoreScrollOffsetsAcrossFrames(root, remainingFrames - 1);
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(restore);
    return;
  }
  queueMicrotask(restore);
}

function clearScrollbarsSuppressedAcrossFrames(
  root: HTMLElement,
  token: number,
  currentToken: () => number,
  remainingFrames: number,
): void {
  if (remainingFrames <= 0) {
    if (currentToken() === token) {
      delete root.dataset.scrollbarsSuppressed;
    }
    return;
  }
  const clear = () => {
    clearScrollbarsSuppressedAcrossFrames(root, token, currentToken, remainingFrames - 1);
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(clear);
    return;
  }
  queueMicrotask(clear);
}

export function createReactDomSurfaceAdapter(
  pane: WorkspacePane,
  rootFactory?: ReactSurfaceRootFactory,
  options: ReactDomSurfaceAdapterOptions = {},
): ReactDomSurfaceAdapter {
  if (pane.surfaceKind === "chat-dom") {
    return new ReactDomSurfaceAdapter(pane, () => <WorkspaceChatSurface />, rootFactory);
  }
  if (pane.surfaceKind === "fake-long-chat") {
    return new ReactDomSurfaceAdapter(pane, () => <FakeLongChatSurface pane={pane} />, rootFactory);
  }
  if (pane.surfaceKind === "workflow-graph") {
    return new ReactDomSurfaceAdapter(
      pane,
      () => (
        <WorkflowGraphSurface
          debugEnabled={workflowGraphDebugEnabled()}
          syntheticGraphFallback={options.workflowGraphSyntheticGraphFallback}
          surfaceId={pane.surfaceId}
        />
      ),
      rootFactory,
    );
  }
  if (pane.surfaceKind === "settings-dom") {
    return new ReactDomSurfaceAdapter(
      pane,
      ({ activated, focused }) => <WorkspaceSettingsSurface active={focused} loaded={activated} />,
      rootFactory,
    );
  }
  if (pane.surfaceKind === "workflow-node-details") {
    return new ReactDomSurfaceAdapter(pane, () => <WorkflowNodeDetailsSurface />, rootFactory);
  }
  if (pane.surfaceKind === "workflow-settings") {
    return new ReactDomSurfaceAdapter(pane, () => <WorkflowSettingsSurface />, rootFactory);
  }
  throw new Error(`surface ${pane.surfaceId} is not a React DOM surface`);
}

function workflowGraphDebugEnabled(): boolean {
  return typeof window !== "undefined" && Boolean(window.setta?.app.flags.workflowGraphDebug);
}

function performanceNow(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}

function emptyCanvasStats(): CanvasSurfaceStats {
  return {
    drawCalls: 0,
    farZoomSimplified: false,
    gpuMemoryEstimateBytes: null,
    liveCanvasPaneCount: 0,
    renderedFrames: 0,
  };
}

function workflowGraphDebugSnapshot(surfaceId: SurfaceId): WorkflowGraphDebugSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  const api = window.__settaWorkflowGraphDebug;
  if (!api || !api.getSurfaceIds().includes(surfaceId)) {
    return null;
  }
  return api.getSnapshot(surfaceId);
}

type WorkflowGraphDebugSnapshot = ReturnType<
  NonNullable<Window["__settaWorkflowGraphDebug"]>["getSnapshot"]
>;

function deferReactRootUnmount(root: ReactSurfaceRoot): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(() => root.unmount());
    return;
  }
  setTimeout(() => root.unmount(), 0);
}
