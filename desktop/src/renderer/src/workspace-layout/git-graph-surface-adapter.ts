import {
  selectGitGraphRenderer,
  type GitGraphEdge,
  type GitGraphLayoutBatch,
  type GitGraphLayoutRequest,
  type GitGraphNode,
  type GitGraphWorkerMessage,
} from "./git-graph-layout";
import type {
  FreezeReason,
  GitGraphRendererKind,
  GitGraphSurfaceStats,
  WorkspacePane,
  PaneSnapshot,
  Rect,
  ResumeReason,
  SurfaceAdapter,
  SurfaceId,
  ViewportChangeReason,
} from "./types";

interface GitGraphFrameLoop {
  cancelFrame(handle: number): void;
  requestFrame(callback: FrameRequestCallback): number;
}

export interface GitGraphWorkerCallbacks {
  onBatch(batch: GitGraphLayoutBatch): void;
  onComplete(): void;
}

export interface GitGraphWorkerClient {
  destroy(): void;
  requestLayout(
    request: GitGraphLayoutRequest,
    callbacks: GitGraphWorkerCallbacks,
  ): {
    cancel(): void;
  };
}

const browserFrameLoop: GitGraphFrameLoop = {
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

const defaultGraphNodeCount = 1800;
const graphBatchSize = 240;
const graphLaneCount = 7;

type GitGraphWorkerClientFactory = () => GitGraphWorkerClient;

class BrowserGitGraphWorkerClient implements GitGraphWorkerClient {
  private readonly callbacksByRequestId = new Map<string, GitGraphWorkerCallbacks>();
  private nextRequestSequence = 0;
  private readonly worker: Worker;

  constructor() {
    if (typeof Worker === "undefined") {
      throw new Error("git graph layout requires a browser Worker");
    }
    this.worker = new Worker(new URL("./git-graph-worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.addEventListener("message", this.handleWorkerMessage);
  }

  destroy(): void {
    this.callbacksByRequestId.clear();
    this.worker.removeEventListener("message", this.handleWorkerMessage);
    this.worker.terminate();
  }

  requestLayout(
    request: GitGraphLayoutRequest,
    callbacks: GitGraphWorkerCallbacks,
  ): {
    cancel(): void;
  } {
    const requestId = `git-graph-${this.nextRequestSequence}`;
    this.nextRequestSequence += 1;
    this.callbacksByRequestId.set(requestId, callbacks);
    this.worker.postMessage({ request, requestId, type: "layout" });
    return {
      cancel: () => {
        this.callbacksByRequestId.delete(requestId);
        this.worker.postMessage({ requestId, type: "cancel" });
      },
    };
  }

  private handleWorkerMessage = (event: MessageEvent<GitGraphWorkerMessage>): void => {
    const message = event.data;
    const callbacks = this.callbacksByRequestId.get(message.requestId);
    if (!callbacks) {
      return;
    }
    if (message.type === "batch") {
      callbacks.onBatch(message.value);
      return;
    }
    callbacks.onComplete();
    this.callbacksByRequestId.delete(message.requestId);
  };
}

export class GitGraphSurfaceAdapter implements SurfaceAdapter {
  readonly kind = "git-graph" as const;

  private canvas: HTMLCanvasElement | null = null;
  private completed = false;
  private destroyed = false;
  private edges: GitGraphEdge[] = [];
  private focused = false;
  private frameHandle: number | null = null;
  private frozen = false;
  private graphRoot: HTMLElement | null = null;
  private host: HTMLElement | null = null;
  private layoutHandle: { cancel(): void } | null = null;
  private nodeById = new Map<string, GitGraphNode>();
  private nodes: GitGraphNode[] = [];
  private renderer: GitGraphRendererKind = "canvas";
  private scale = 0.34;
  private status: HTMLElement | null = null;
  private visible = false;
  private workerBatches = 0;
  private workerClient: GitGraphWorkerClient | null = null;
  private workerPending = false;

  constructor(
    private readonly pane: WorkspacePane,
    private readonly createWorkerClient: GitGraphWorkerClientFactory = () =>
      new BrowserGitGraphWorkerClient(),
    private readonly frameLoop: GitGraphFrameLoop = browserFrameLoop,
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
    const content = renderGitGraphContent(host, this.pane);
    this.canvas = content.canvas;
    this.graphRoot = content.graphRoot;
    this.status = content.status;
    host.replaceChildren(content.root);
    host.addEventListener("wheel", this.handleWheel, { passive: false });
    this.syncHostState();
    this.startLayout();
  }

  unmount(): void {
    this.stopPaint();
    this.host?.removeEventListener("wheel", this.handleWheel);
    this.host?.replaceChildren();
    this.canvas = null;
    this.graphRoot = null;
    this.host = null;
    this.status = null;
    this.visible = false;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncHostState();
    if (visible) {
      this.startLayout();
      this.requestPaint();
      return;
    }
    this.stopPaint();
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.syncHostState();
  }

  setViewport(rect: Rect, reason: ViewportChangeReason): void {
    this.host?.setAttribute("data-viewport-reason", reason);
    this.host?.setAttribute(
      "data-surface-viewport",
      `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    );
    this.resizeCanvas(rect);
    this.requestPaint();
  }

  freeze(reason: FreezeReason): void {
    this.frozen = true;
    this.host?.setAttribute("data-freeze-reason", reason);
    this.stopPaint();
    if (reason === "teardown") {
      this.cancelLayout();
      this.destroyWorker();
    }
    this.syncHostState();
  }

  resume(reason: ResumeReason): void {
    this.frozen = false;
    this.host?.setAttribute("data-resume-reason", reason);
    this.syncHostState();
    this.startLayout();
    this.requestPaint();
  }

  captureSnapshot(): Promise<PaneSnapshot> {
    return Promise.resolve({
      capturedAt: performanceNow(),
      label: `${this.pane.title} graph ${this.nodes.length}/${defaultGraphNodeCount}`,
      surfaceId: this.surfaceId,
    });
  }

  getGitGraphStats(): GitGraphSurfaceStats {
    return {
      completed: this.completed,
      liveGraphPaneCount: this.visible && !this.frozen && this.host ? 1 : 0,
      progress: this.nodes.length / defaultGraphNodeCount,
      renderedEdges: this.edges.length,
      renderedNodes: this.nodes.length,
      renderer: this.renderer,
      workerBatches: this.workerBatches,
      workerPending: this.workerPending,
    };
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.unmount();
    this.destroyWorker();
    this.destroyed = true;
  }

  private cancelLayout(): void {
    this.layoutHandle?.cancel();
    this.layoutHandle = null;
    this.workerPending = false;
  }

  private destroyWorker(): void {
    this.layoutHandle = null;
    this.workerPending = false;
    this.workerClient?.destroy();
    this.workerClient = null;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error(`git graph surface ${this.surfaceId} has already been destroyed`);
    }
  }

  private handleBatch = (batch: GitGraphLayoutBatch): void => {
    this.nodes.push(...batch.nodes);
    this.edges.push(...batch.edges);
    for (const node of batch.nodes) {
      this.nodeById.set(node.id, node);
    }
    this.workerBatches += 1;
    this.completed = batch.done;
    this.requestPaint();
  };

  private handleComplete = (): void => {
    this.completed = true;
    this.workerPending = false;
    this.layoutHandle = null;
    this.requestPaint();
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const nextScale = this.scale * (event.deltaY > 0 ? 0.9 : 1.1);
    this.scale = Math.max(0.22, Math.min(1.4, nextScale));
    this.requestPaint();
  };

  private paint = (): void => {
    this.frameHandle = null;
    if (!this.visible || this.frozen || !this.host) {
      return;
    }
    this.renderer = selectGitGraphRenderer({
      nodeCount: defaultGraphNodeCount,
      scale: this.scale,
    });
    if (this.renderer === "canvas") {
      this.paintCanvas();
    } else {
      this.paintDomLikeGraph();
    }
    this.syncHostState();
  };

  private paintCanvas(): void {
    const context = this.canvas?.getContext("2d");
    if (!context || !this.canvas) {
      return;
    }
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.fillStyle = "rgba(13, 18, 24, 0.94)";
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.paintCanvasEdges(context);
    this.paintCanvasNodes(context);
  }

  private paintCanvasEdges(context: CanvasRenderingContext2D): void {
    context.fillStyle = "rgba(148, 163, 184, 0.18)";
    for (const edge of this.edges.slice(-240)) {
      const from = this.nodeById.get(edge.from);
      const to = this.nodeById.get(edge.to);
      if (from && to) {
        context.fillRect(
          from.x * this.scale,
          from.y * this.scale,
          1,
          Math.max(3, (to.y - from.y) * this.scale),
        );
      }
    }
  }

  private paintCanvasNodes(context: CanvasRenderingContext2D): void {
    for (const node of this.nodes.slice(-360)) {
      context.fillStyle =
        node.lane % 2 === 0 ? "rgba(45, 212, 191, 0.68)" : "rgba(125, 211, 252, 0.62)";
      context.fillRect(node.x * this.scale, node.y * this.scale, 5, 5);
    }
  }

  private paintDomLikeGraph(): void {
    if (!this.graphRoot) {
      return;
    }
    const document = this.graphRoot.ownerDocument;
    const rows = this.nodes.slice(-40).map((node) => {
      const row = document.createElement("div");
      row.className = "workspace-git-graph-row";
      row.style.paddingLeft = `${Math.round(node.lane * 10)}px`;
      row.textContent = node.label;
      return row;
    });
    this.graphRoot.replaceChildren(...rows);
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
    this.canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.floor((rect.height - 52) * ratio));
  }

  private startLayout(): void {
    if (!this.visible || this.frozen || this.completed || this.layoutHandle) {
      return;
    }
    if (this.nodes.length > 0) {
      this.resetPartialLayout();
    }
    this.workerClient = this.workerClient ?? this.createWorkerClient();
    this.workerPending = true;
    this.layoutHandle = this.workerClient.requestLayout(
      {
        batchSize: graphBatchSize,
        laneCount: graphLaneCount,
        nodeCount: defaultGraphNodeCount,
      },
      {
        onBatch: this.handleBatch,
        onComplete: this.handleComplete,
      },
    );
  }

  private resetPartialLayout(): void {
    this.edges = [];
    this.nodeById.clear();
    this.nodes = [];
    this.workerBatches = 0;
  }

  private stopPaint(): void {
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
    const progress = this.getGitGraphStats().progress;
    this.host.dataset.gitGraphProgress = String(Math.round(progress * 100));
    this.host.dataset.gitGraphRenderer = this.renderer;
    this.host.dataset.gitGraphWorkerBatches = String(this.workerBatches);
    this.host.dataset.surfaceFocused = String(this.focused);
    this.host.dataset.surfaceFrozen = String(this.frozen);
    this.host.dataset.surfaceVisible = String(this.visible);
    this.host.style.visibility = this.visible ? "visible" : "hidden";
    if (this.canvas) {
      this.canvas.style.display = this.renderer === "canvas" ? "block" : "none";
    }
    if (this.graphRoot) {
      this.graphRoot.style.display = this.renderer === "canvas" ? "none" : "grid";
    }
    if (this.status) {
      this.status.textContent = `${this.renderer} ${Math.round(progress * 100)}%`;
    }
  }
}

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

function renderGitGraphContent(
  host: HTMLElement,
  pane: WorkspacePane,
): { canvas: HTMLCanvasElement; graphRoot: HTMLElement; root: HTMLElement; status: HTMLElement } {
  const document = host.ownerDocument;
  const root = document.createElement("div");
  root.className = "workspace-pane-content workspace-git-graph-surface";

  const header = document.createElement("div");
  header.className = "workspace-git-graph-header";
  const title = document.createElement("h2");
  title.textContent = pane.title;
  const status = document.createElement("span");
  status.className = "workspace-git-graph-status";
  header.append(title, status);

  const canvas = document.createElement("canvas");
  canvas.className = "workspace-git-graph-canvas";
  canvas.setAttribute("aria-label", `${pane.title} progressive git graph`);
  canvas.setAttribute("role", "img");

  const graphRoot = document.createElement("div");
  graphRoot.className = "workspace-git-graph-dom";
  graphRoot.setAttribute("aria-hidden", "true");

  root.append(header, canvas, graphRoot);
  return { canvas, graphRoot, root, status };
}
