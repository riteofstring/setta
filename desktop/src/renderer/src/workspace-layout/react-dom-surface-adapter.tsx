import type { ReactNode } from "react";
import { createRoot as createReactRoot, type Root } from "react-dom/client";

import { EasyButtonSurface } from "../features/easy-button/easy-button-surface";
import type { GlobalSpeechPresentationSource } from "../features/global-speech/global-speech-presentation";
import type { SpeechCaptureRequester } from "../features/global-speech/speech-capture-destination";
import { WorkflowGraphSurface } from "../features/workspace-graph/workflow-graph-surface";
import type { SyntheticWorkflowGraphOptions } from "../features/workspace-graph/workflow-graph-camera-scope";
import { SemanticNodeDetailsSurface } from "../features/workspace-graph/semantic-node-details-surface";
import { WorkflowNodeDetailsSurface } from "../features/workspace-graph/workflow-node-details-surface";
import { WorkflowSettingsSurface } from "../features/workspace-graph/workflow-settings-surface";
import { workflowGraphRuntimeHandle } from "../features/workspace-graph/workflow-graph-runtime-registry";
import {
  FakeLongChatSurface,
  WorkspaceChatSurface,
  WorkspaceSettingsSurface,
} from "./workspace-dom-surfaces";
import {
  applySnapshotScrollOffsets,
  cloneSnapshotNode,
  recordSnapshotScrollOffsets,
} from "./surface-dom-content";
import { notifyReactDomSurfaceHostChanged } from "./react-dom-surface-events";
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
  interactive: boolean;
}

export interface ReactDomSurfaceAdapterOptions {
  speechCapture?: SpeechCaptureRequester;
  speechPresentation?: GlobalSpeechPresentationSource;
  workspaceId?: string;
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
  private frozenVisual: HTMLElement | null = null;
  private host: HTMLElement | null = null;
  private root: ReactSurfaceRoot | null = null;
  private activated = false;
  private frozenCanvasStats: CanvasSurfaceStats | null = null;
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
    notifyReactDomSurfaceHostChanged(this.container);
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
    this.removeFrozenVisual();
    this.frozenCanvasStats = null;
    this.host?.replaceChildren();
    if (this.container) {
      notifyReactDomSurfaceHostChanged(this.container);
    }
    this.host = null;
    this.visible = false;
  }

  setVisible(visible: boolean): void {
    const wasInteractive = this.workflowGraphInteractive();
    this.visible = visible;
    const activatedChanged = visible && !this.activated;
    if (visible) {
      this.activated = true;
    }
    const interactiveChanged = wasInteractive !== this.workflowGraphInteractive();
    if (activatedChanged || interactiveChanged) {
      this.renderCurrentSurface();
    }
    this.syncWorkflowGraphRuntimeState();
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
    this.syncWorkflowGraphRuntimeState();
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
    const wasInteractive = this.workflowGraphInteractive();
    if (!this.frozen) {
      this.installFrozenVisual();
    }
    this.frozen = true;
    this.frozenCanvasStats = null;
    this.syncWorkflowGraphRuntimeState();
    if (wasInteractive !== this.workflowGraphInteractive()) {
      this.renderCurrentSurface();
    }
    this.host?.setAttribute("data-freeze-reason", reason);
    this.syncHostState();
  }

  resume(reason: ResumeReason): void {
    const wasInteractive = this.workflowGraphInteractive();
    const wasFrozen = this.frozen;
    this.frozen = false;
    this.removeFrozenVisual();
    this.frozenCanvasStats = null;
    this.syncWorkflowGraphRuntimeState();
    if (wasInteractive !== this.workflowGraphInteractive()) {
      this.renderCurrentSurface();
    }
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
    const state = {
      frozen: this.frozen,
      mounted: this.host !== null,
      visible: this.visible,
    };
    if (this.frozen) {
      this.frozenCanvasStats ??= canvasStatsForWorkflowGraphSnapshot(
        workflowGraphDebugSnapshot(this.surfaceId),
        state,
      );
      return this.frozenCanvasStats;
    }
    this.frozenCanvasStats = null;
    const snapshot = workflowGraphDebugSnapshot(this.surfaceId);
    return canvasStatsForWorkflowGraphSnapshot(snapshot, state);
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
      if (this.frozenVisual !== null) {
        this.container.dataset.liveFrozenHidden = "true";
      } else {
        delete this.container.dataset.liveFrozenHidden;
      }
      this.container.dataset.visible = String(this.visible);
    }
  }

  private syncWorkflowGraphRuntimeState(): void {
    if (this.kind !== "workflow-graph") {
      return;
    }
    const handle = workflowGraphRuntimeHandle(this.surfaceId);
    handle?.setFocused(this.workflowGraphInteractive());
    handle?.setFrozen(this.frozen);
  }

  private workflowGraphInteractive(): boolean {
    return this.kind === "workflow-graph" && this.visible && !this.frozen;
  }

  private renderCurrentSurface(): void {
    this.root?.render(
      this.renderSurface({
        activated: this.activated,
        focused: this.focused,
        interactive: this.workflowGraphInteractive(),
      }),
    );
  }

  private installFrozenVisual(): void {
    if (this.kind === "workflow-graph") {
      return;
    }
    const host = this.host;
    const container = this.container;
    if (!host || !container) {
      return;
    }
    recordSnapshotScrollOffsets(container);
    this.removeFrozenVisual();
    const visual = host.ownerDocument.createElement("div");
    visual.className = "workspace-frozen-dom-visual";
    visual.dataset.surfaceKind = this.kind;
    visual.append(cloneSnapshotNode(container, host.ownerDocument));
    host.append(visual);
    applySnapshotScrollOffsets(visual);
    this.frozenVisual = visual;
  }

  private removeFrozenVisual(): void {
    this.frozenVisual?.remove();
    this.frozenVisual = null;
    if (this.container) {
      delete this.container.dataset.liveFrozenHidden;
    }
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
    queueMicrotask(() => applySnapshotScrollOffsets(root));
    setTimeout(() => applySnapshotScrollOffsets(root), 0);
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
  const renderSurface = reactDomSurfaceRenderFactories[pane.surfaceKind]?.(pane, options);
  if (renderSurface) {
    return new ReactDomSurfaceAdapter(pane, renderSurface, rootFactory);
  }
  throw new Error(`surface ${pane.surfaceId} is not a React DOM surface`);
}

type ReactDomSurfaceRenderFactory = (
  pane: WorkspacePane,
  options: ReactDomSurfaceAdapterOptions,
) => (state: ReactDomSurfaceState) => ReactNode;

const reactDomSurfaceRenderFactories: Partial<Record<SurfaceKind, ReactDomSurfaceRenderFactory>> = {
  "chat-dom": () => () => <WorkspaceChatSurface />,
  "easy-button": (pane, options) => () => (
    <EasyButtonSurface
      conversationId={pane.easyButtonConfig?.conversationId ?? null}
      paneId={pane.paneId}
      speechCapture={options.speechCapture}
      speechPresentation={options.speechPresentation}
      workspaceId={options.workspaceId ?? null}
    />
  ),
  "fake-long-chat": (pane) => () => <FakeLongChatSurface pane={pane} />,
  "workflow-graph":
    (pane, options) =>
    ({ interactive }) => (
      <WorkflowGraphSurface
        debugEnabled={workflowGraphDebugEnabled()}
        focused={interactive}
        syntheticGraphFallback={options.workflowGraphSyntheticGraphFallback}
        surfaceId={pane.surfaceId}
      />
    ),
  "settings-dom":
    () =>
    ({ activated, focused }) => <WorkspaceSettingsSurface active={focused} loaded={activated} />,
  "semantic-node-details": () => () => <SemanticNodeDetailsSurface />,
  "workflow-node-details": (pane) => () => <WorkflowNodeDetailsSurface pane={pane} />,
  "workflow-settings": () => () => <WorkflowSettingsSurface />,
};

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
    backingStorePixels: null,
    drawCalls: 0,
    farZoomSimplified: false,
    gpuMemoryEstimateBytes: null,
    liveCanvasPaneCount: 0,
    rendererResizeCount: 0,
    renderedFrames: 0,
    tickerFramesWhileFrozen: 0,
  };
}

function workflowGraphDebugSnapshot(surfaceId: SurfaceId): WorkflowGraphDebugSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  const api = window.__settaWorkflowGraphDebug;
  return api?.tryGetSnapshot(surfaceId) ?? null;
}

function canvasStatsForWorkflowGraphSnapshot(
  snapshot: WorkflowGraphDebugSnapshot | null,
  state: { frozen: boolean; mounted: boolean; visible: boolean },
): CanvasSurfaceStats {
  const backingStorePixels = workflowGraphBackingStorePixels(snapshot);
  const renderStats = workflowGraphRenderStats(snapshot);
  return {
    backingStorePixels,
    drawCalls: 0,
    farZoomSimplified: false,
    gpuMemoryEstimateBytes: workflowGraphGpuMemoryEstimateBytes(backingStorePixels),
    liveCanvasPaneCount: workflowGraphLiveCanvasPaneCount(state),
    ...renderStats,
  };
}

function workflowGraphBackingStorePixels(
  snapshot: WorkflowGraphDebugSnapshot | null,
): number | null {
  if (!snapshot) {
    return null;
  }
  return snapshot.canvas.width * snapshot.canvas.height;
}

function workflowGraphGpuMemoryEstimateBytes(backingStorePixels: number | null): number | null {
  if (backingStorePixels === null) {
    return null;
  }
  return backingStorePixels * 4;
}

function workflowGraphLiveCanvasPaneCount(state: {
  frozen: boolean;
  mounted: boolean;
  visible: boolean;
}): number {
  if (!state.visible) {
    return 0;
  }
  if (state.frozen) {
    return 0;
  }
  if (!state.mounted) {
    return 0;
  }
  return 1;
}

function workflowGraphRenderStats(
  snapshot: WorkflowGraphDebugSnapshot | null,
): Pick<CanvasSurfaceStats, "renderedFrames" | "rendererResizeCount" | "tickerFramesWhileFrozen"> {
  if (!snapshot) {
    return {
      renderedFrames: 0,
      rendererResizeCount: 0,
      tickerFramesWhileFrozen: 0,
    };
  }
  return {
    renderedFrames: snapshot.render.frameCount,
    rendererResizeCount: snapshot.render.rendererResizeCount,
    tickerFramesWhileFrozen: snapshot.render.tickerFramesWhileFrozen,
  };
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
