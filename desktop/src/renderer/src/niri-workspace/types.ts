export type PaneId = string;
export type ColumnId = string;
export type SurfaceId = string;

export type SurfaceKind =
  | "browser"
  | "chat-dom"
  | "fake-canvas"
  | "fake-dom"
  | "fake-heavy-dom"
  | "fake-long-chat"
  | "git-graph"
  | "pixi-canvas"
  | "settings-dom"
  | "snapshot"
  | "terminal";

export type PaneRuntimeState = "live" | "live-throttled" | "snapshot" | "hidden" | "destroyed";

export type ViewportChangeReason = "frame" | "mount" | "resize" | "resize-active";

export type ResizePhase = "active" | "idle" | "settled";

export type FreezeReason = "hidden" | "runtime-policy" | "snapshot" | "teardown";

export type ResumeReason = "focused" | "runtime-policy" | "visible";

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface SizeSpec {
  value: number;
  unit: "px" | "weight";
}

export interface NiriPane {
  columnId: ColumnId;
  heat: number;
  paneId: PaneId;
  sequence: number;
  subtitle: string;
  surfaceId: SurfaceId;
  surfaceKind: SurfaceKind;
  title: string;
  tone: "cyan" | "green" | "orange" | "pink" | "slate";
  weight: number;
}

export interface NiriColumn {
  columnId: ColumnId;
  index: number;
  paneIds: PaneId[];
  widthWeight: number;
}

export interface NiriWorkspaceScene {
  columnGap: number;
  columns: NiriColumn[];
  id: string;
  paneById: ReadonlyMap<PaneId, NiriPane>;
  panes: NiriPane[];
  panesPerColumn: number;
  padding: number;
  rowGap: number;
  targetVisiblePanes: number;
  totalPanes: number;
  visibleColumnCount: number;
}

export interface OpenPaneRequest {
  columnId?: ColumnId;
  title?: string;
}

export interface LayoutFrameInput {
  focusedPaneId: PaneId;
  movementPhase: "idle" | "moving";
  scrollColumn: number;
  viewport: Rect;
}

export interface PaneRenderItem {
  focused: boolean;
  height: number;
  moving: boolean;
  opacity: number;
  paneId: PaneId;
  resizing: boolean;
  runtimeState: PaneRuntimeState;
  surfaceId: SurfaceId;
  surfaceKind: SurfaceKind;
  visible: boolean;
  width: number;
  x: number;
  y: number;
  z: number;
}

export interface PaneSnapshot {
  capturedAt: number;
  label: string;
  surfaceId: SurfaceId;
}

export interface CanvasSurfaceStats {
  drawCalls: number;
  farZoomSimplified: boolean;
  gpuMemoryEstimateBytes: number | null;
  liveCanvasPaneCount: number;
  renderedFrames: number;
}

export type GitGraphRendererKind = "canvas" | "dom" | "svg";

export interface GitGraphSurfaceStats {
  completed: boolean;
  liveGraphPaneCount: number;
  progress: number;
  renderedEdges: number;
  renderedNodes: number;
  renderer: GitGraphRendererKind | null;
  workerBatches: number;
  workerPending: boolean;
}

export interface TerminalSurfaceStats {
  dirtyRows: number;
  droppedOutputChunks: number;
  liveTerminalRendererCount: number;
  pendingOutputChunks: number;
  renderedRows: number;
  scrollbackRows: number;
}

export interface SurfaceAdapter {
  readonly kind: SurfaceKind;
  readonly surfaceId: SurfaceId;

  mount(host: HTMLElement): void;
  unmount(): void;

  setVisible(visible: boolean): void;
  setFocused(focused: boolean): void;

  setViewport(rect: Rect, reason: ViewportChangeReason): void;

  freeze(reason: FreezeReason): void;
  resume(reason: ResumeReason): void;

  captureSnapshot?(): Promise<PaneSnapshot>;
  getCanvasStats?(): CanvasSurfaceStats;
  getGitGraphStats?(): GitGraphSurfaceStats;
  getTerminalStats?(): TerminalSurfaceStats;
  destroy(): void;
}

export interface PaneRuntimeBudget {
  maxLiveBrowserPanes: number;
  maxLiveHeavyDomPanes: number;
  maxLiveTerminalRenderers: number;
  maxLiveWebGpuCanvases: number;
  maxSnapshotPanes: number;
}

export interface PaneRuntimeSummary {
  budget: PaneRuntimeBudget;
  hidden: number;
  live: number;
  liveThrottled: number;
  snapshot: number;
  total: number;
}

export interface LayoutEngine {
  closePane(paneId: PaneId): void;
  moveFocus(direction: "up" | "down" | "left" | "right"): void;
  movePane(paneId: PaneId, direction: "up" | "down" | "left" | "right"): void;
  openPane(request: OpenPaneRequest): PaneId;
  renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void;
  resizeColumn(columnId: ColumnId, width: SizeSpec): void;
  resizePane(paneId: PaneId, heightWeight: number): void;
  splitPane(paneId: PaneId, direction: "up" | "down" | "left" | "right"): PaneId;
}

export interface NiriFrameMetrics {
  droppedFrames: number;
  frameCount: number;
  frameTime: number;
  longTasks: number;
  nativeBoundsUpdates: number;
  p50FrameTime: number;
  p95FrameTime: number;
  p99FrameTime: number;
  reactCommitsDuringMovement: number;
  reactCommitsDuringResize: number;
  resize: NiriResizeMetrics;
  canvasDrawCalls: number;
  canvasGpuMemoryEstimateBytes: number | null;
  gitGraphProgress: number;
  gitGraphRenderedNodes: number;
  gitGraphRenderer: GitGraphRendererKind | null;
  gitGraphWorkerBatches: number;
  gitGraphWorkerPending: boolean;
  liveCanvasPaneCount: number;
  liveGitGraphPaneCount: number;
  liveTerminalRendererCount: number;
  terminalDirtyRows: number;
  terminalDroppedOutputChunks: number;
  terminalPendingOutputChunks: number;
  boxWrites: number;
  transformWrites: number;
  visiblePaneCount: number;
}

export interface NiriResizeMetrics {
  active: boolean;
  boxWrites: number;
  browserViewportWrites: number;
  canvasViewportWrites: number;
  deferredHeavyViewportWrites: number;
  finalViewport: Rect | null;
  finalViewportCommits: number;
  frameCount: number;
  frameTime: number;
  gitGraphViewportWrites: number;
  heavyViewportWrites: number;
  longTasks: number;
  nativeBoundsUpdates: number;
  p50FrameTime: number;
  p95FrameTime: number;
  p99FrameTime: number;
  settledFrameCount: number;
  surfaceViewportWrites: number;
  terminalViewportWrites: number;
  transformWrites: number;
}

export interface NiriPerformanceReport {
  benchmark: {
    durationMs: number;
    expectedVisiblePanes: number;
    name: string;
    targetFrameMs: number;
    totalPanes: number;
  };
  environment: {
    devicePixelRatio: number;
    rendererMode: "development" | "production";
    userAgent: string;
    viewport: Rect;
  };
  metrics: NiriFrameMetrics;
  notes: string[];
  result: "pass" | "fail";
  timestamp: string;
}
