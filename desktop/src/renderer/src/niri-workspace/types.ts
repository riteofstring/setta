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

export type NiriPresentationMode = "normal" | "overview";

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

export interface ColumnWidthSpec {
  value: number;
  unit: "proportion" | "px";
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
  idealWidthSpec: ColumnWidthSpec;
  index: number;
  paneIds: PaneId[];
  previousProportionWidth?: number;
  widthSpec: ColumnWidthSpec;
}

export interface NiriWorkspaceScene {
  columnGap: number;
  columns: NiriColumn[];
  defaultColumnWidthSpec: ColumnWidthSpec;
  id: string;
  paneById: ReadonlyMap<PaneId, NiriPane>;
  panes: NiriPane[];
  panesPerColumn: number;
  padding: number;
  renderOverscanColumns: number;
  rowGap: number;
  targetVisiblePanes: number;
  totalPanes: number;
  visibleColumnCount: number;
}

export interface OpenPaneRequest {
  adjacentToColumnId?: ColumnId;
  columnId?: ColumnId;
  subtitle?: string;
  surfaceKind?: SurfaceKind;
  title?: string;
  tone?: NiriPane["tone"];
  weight?: number;
  widthSpec?: ColumnWidthSpec;
}

export interface LayoutFrameInput {
  focusedPaneId: PaneId;
  maximizedPaneId: PaneId | null;
  movementPhase: "idle" | "moving";
  presentationMode: NiriPresentationMode;
  scrollColumn: number;
  scrollRow: number;
  viewport: Rect;
}

export interface PaneRenderItem {
  focused: boolean;
  height: number;
  maximized: boolean;
  moving: boolean;
  opacity: number;
  paneId: PaneId;
  presentationMode: NiriPresentationMode;
  resizing: boolean;
  runtimeState: PaneRuntimeState;
  scale: number;
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
  lockColumnWidth(columnId: ColumnId, viewportWidth: number): void;
  moveFocus(direction: "up" | "down" | "left" | "right"): void;
  movePane(paneId: PaneId, direction: "up" | "down" | "left" | "right"): void;
  openPane(request: OpenPaneRequest): PaneId;
  paneInVisualDirection(
    paneId: PaneId,
    direction: "up" | "down" | "left" | "right",
    viewport: Rect,
  ): PaneId | null;
  renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void;
  resetColumnWidth(columnId: ColumnId): void;
  resizeColumn(columnId: ColumnId, width: ColumnWidthSpec): void;
  resizePane(paneId: PaneId, heightWeight: number): void;
  splitPane(paneId: PaneId, direction: "up" | "down" | "left" | "right"): PaneId;
  unlockColumnWidth(columnId: ColumnId, viewportWidth: number): void;
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
