export type PaneId = string;
export type ColumnId = string;
export type SurfaceId = string;

export const productSurfaceKinds = [
  "chat-dom",
  "empty-frame",
  "workflow-graph",
  "settings-dom",
  "terminal",
  "semantic-node-details",
  "workflow-node-details",
  "workflow-settings",
] as const;

export type ProductSurfaceKind = (typeof productSurfaceKinds)[number];
type DiagnosticSurfaceKind =
  | "browser"
  | "fake-dom"
  | "fake-heavy-dom"
  | "fake-long-chat"
  | "fake-terminal"
  | "git-graph"
  | "snapshot";
export type SurfaceKind = ProductSurfaceKind | DiagnosticSurfaceKind;

export type PaneRuntimeState = "live" | "live-throttled" | "snapshot" | "hidden" | "destroyed";

export type WorkspacePresentationMode = "normal" | "overview";

export type ViewportChangeReason =
  | "frame"
  | "mount"
  | "movement-active"
  | "resize"
  | "resize-active";

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

export interface WorkspacePane {
  columnId: ColumnId;
  heat: number;
  paneId: PaneId;
  sequence: number;
  subtitle: string;
  surfaceId: SurfaceId;
  surfaceKind: SurfaceKind;
  terminalConfig?: TerminalPaneConfig;
  title: string;
  tone: "cyan" | "green" | "orange" | "pink" | "slate";
  weight: number;
}

export interface TerminalPaneConfig {
  cwdOverride?: string;
  profileId: string;
  titleOverride?: string;
}

export interface WorkspaceColumn {
  columnId: ColumnId;
  idealWidthSpec: ColumnWidthSpec;
  index: number;
  paneIds: PaneId[];
  planeIndex: number;
  previousProportionWidth?: number;
  slotIndex?: number;
  widthSpec: ColumnWidthSpec;
}

export interface WorkspaceScene {
  columnGap: number;
  columns: WorkspaceColumn[];
  defaultColumnWidthSpec: ColumnWidthSpec;
  id: string;
  paneById: ReadonlyMap<PaneId, WorkspacePane>;
  panes: WorkspacePane[];
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
  terminalConfig?: TerminalPaneConfig;
  title?: string;
  tone?: WorkspacePane["tone"];
  weight?: number;
  widthSpec?: ColumnWidthSpec;
}

export type PaneInsertionPlacement = "above" | "below" | "right";

export type PaneLimitPolicy = Partial<Record<SurfaceKind, number>>;

export interface LayoutFrameInput {
  focusedPaneId: PaneId;
  maximizedPaneId: PaneId | null;
  movementPhase: "idle" | "moving";
  presentationMode: WorkspacePresentationMode;
  renderAllColumns?: boolean;
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
  presentationMode: WorkspacePresentationMode;
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
  syncFrame?(): void;
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
  configurePane(paneId: PaneId, request: OpenPaneRequest): PaneId;
  lockColumnWidth(columnId: ColumnId, viewportWidth: number): void;
  movePane(paneId: PaneId, direction: "up" | "down" | "left" | "right"): void;
  openPaneNearPane(
    paneId: PaneId,
    placement: PaneInsertionPlacement,
    request: OpenPaneRequest,
  ): PaneId;
  openPane(request: OpenPaneRequest): PaneId;
  paneInVisualDirection(
    paneId: PaneId,
    direction: "up" | "down" | "left" | "right",
    viewport: Rect,
    maximizedPaneId?: PaneId | null,
  ): PaneId | null;
  renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void): void;
  renamePane(paneId: PaneId, title: string): boolean;
  reorderPaneBefore(sourcePaneId: PaneId, targetPaneId: PaneId): boolean;
  resetColumnWidth(columnId: ColumnId): void;
  resizeColumn(columnId: ColumnId, width: ColumnWidthSpec): void;
  resizePane(paneId: PaneId, heightWeight: number): void;
  resizePaneSplit(
    upperPaneId: PaneId,
    lowerPaneId: PaneId,
    upperHeightWeight: number,
    lowerHeightWeight: number,
  ): boolean;
  setPaneTerminalConfig(paneId: PaneId, terminalConfig: TerminalPaneConfig): void;
  splitPane(paneId: PaneId, direction: "up" | "down" | "left" | "right"): PaneId;
  splitPaneToPlane(paneId: PaneId, direction: "up" | "down"): PaneId;
  unlockColumnWidth(columnId: ColumnId, viewportWidth: number): void;
}

export interface WorkspaceFrameMetrics {
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
  resize: WorkspaceResizeMetrics;
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

export interface WorkspaceResizeMetrics {
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

export interface WorkspacePerformanceReport {
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
  metrics: WorkspaceFrameMetrics;
  notes: string[];
  result: "pass" | "fail";
  timestamp: string;
}
