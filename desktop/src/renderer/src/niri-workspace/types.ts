export type PaneId = string;
export type ColumnId = string;
export type SurfaceId = string;

export type SurfaceKind = "fake-dom";

export type PaneRuntimeState = "live" | "live-throttled" | "snapshot" | "hidden" | "destroyed";

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
  transformWrites: number;
  visiblePaneCount: number;
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
