import type { WorkflowNodeDetailsPaneConfig } from "@generated/backend";

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
  heightPx?: number;
  paneId: PaneId;
  sequence: number;
  subtitle: string;
  surfaceId: SurfaceId;
  surfaceKind: SurfaceKind;
  terminalConfig?: TerminalPaneConfig;
  title: string;
  tone: "cyan" | "green" | "orange" | "pink" | "slate";
  weight: number;
  workflowNodeDetailsConfig?: WorkflowNodeDetailsPaneConfig;
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
  workflowNodeDetailsConfig?: WorkflowNodeDetailsPaneConfig;
  widthSpec?: ColumnWidthSpec;
}

export type PaneInsertionPlacement = "above" | "below" | "right";
export type PaneDropPlacement = "after" | "before";

export type PaneDropIntent =
  | {
      kind: "row";
      placement: PaneDropPlacement;
      targetPaneId: PaneId;
    }
  | {
      kind: "column";
      planeIndex: number;
      slotPlacement: PaneDropPlacement;
      targetColumnId: ColumnId;
    }
  | {
      // Move the source pane into an empty horizontal slot in a plane. The slot is
      // anchored by a column from another plane, so the new column shares that
      // slot's width instead of inventing an unrelated width.
      kind: "plane-slot";
      planeIndex: number;
      referenceColumnId: ColumnId;
      slotIndex: number;
    }
  | {
      // Exchange the source and target panes: each takes the other's grid slot
      // (and therefore that slot's column width). The rest of the layout is
      // untouched. Resolved when a drag is dropped onto a pane's center.
      kind: "swap";
      targetPaneId: PaneId;
    };

export type PaneLimitPolicy = Partial<Record<SurfaceKind, number>>;

export interface LayoutFrameInput {
  focusedPaneId: PaneId;
  maximizedPaneId: PaneId | null;
  movementPhase: "idle" | "moving";
  /**
   * Screen-pixel pan of the overview surface. Lets the user scroll a workspace
   * whose scaled overview is larger than the viewport into view. Ignored outside
   * overview mode. Defaults to 0 (centered / edge-aligned).
   */
  overviewPanX?: number;
  overviewPanY?: number;
  /**
   * User zoom factor applied on top of the fit-all overview scale (1 = fit). The
   * effective overview scale is `clamp(fitScale * overviewZoom, fitScale,
   * OVERVIEW_MAX_ZOOM_SCALE)`. Distinct from `overviewProgress`, which animates
   * the normal<->overview mode transition. Ignored outside overview mode.
   * Defaults to 1.
   */
  overviewZoom?: number;
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
  planeIndex?: number;
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
  backingStorePixels: number | null;
  drawCalls: number;
  farZoomSimplified: boolean;
  gpuMemoryEstimateBytes: number | null;
  liveCanvasPaneCount: number;
  rendererResizeCount: number;
  renderedFrames: number;
  tickerFramesWhileFrozen: number;
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

export type SurfaceSnapshotFreshness = "fresh" | "stale" | "missing";

export interface SurfaceSnapshotMetricsSink {
  recordSnapshotCaptureRequest(input: {
    duringTransition: boolean;
    kind: "bitmap" | "texture";
  }): void;
  recordSnapshotTextureUse(freshness: SurfaceSnapshotFreshness): void;
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
  requestPaneClose?(request: SurfacePaneCloseRequest): Promise<SurfacePaneCloseResult>;
  syncFrame?(): void;
  destroy(): void;
}

export interface SurfacePaneCloseRequest {
  confirm(message: string): boolean;
}

export interface SurfacePaneCloseResult {
  removePane: boolean;
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
  applyPaneDropIntent(sourcePaneId: PaneId, intent: PaneDropIntent): boolean;
  previewPaneDropIntent(sourcePaneId: PaneId, intent: PaneDropIntent): boolean;
  reorderPaneBefore(sourcePaneId: PaneId, targetPaneId: PaneId): boolean;
  resetColumnWidth(columnId: ColumnId): void;
  resizeColumn(columnId: ColumnId, width: ColumnWidthSpec): void;
  resizePane(paneId: PaneId, heightPx: number | null): void;
  resizePaneSplit(
    upperPaneId: PaneId,
    lowerPaneId: PaneId,
    upperHeightWeight: number,
    lowerHeightWeight: number,
  ): boolean;
  setCompactLayout(compact: boolean): void;
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
  paneDragPreviewClears: number;
  paneDragPreviewUpdates: number;
  reactCommitsDuringMovement: number;
  reactCommitsDuringResize: number;
  resize: WorkspaceResizeMetrics;
  canvasDrawCalls: number;
  canvasBackingStorePixels: number | null;
  canvasGpuMemoryEstimateBytes: number | null;
  canvasRendererResizeCount: number;
  canvasTickerFramesWhileFrozen: number;
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
  snapshotCapturePromisesAwaitedByTransition: number;
  snapshotBitmapCaptureRequests: number;
  snapshotCaptureRequests: number;
  snapshotCaptureRequestsDuringTransition: number;
  snapshotFreshTextureUses: number;
  snapshotMissingTextureUses: number;
  snapshotStaleTextureUses: number;
  snapshotTextureCaptureRequests: number;
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
