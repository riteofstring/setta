import type {
  ConnectingHandle,
  ConnectionStatus,
  HandlePosition,
  Node,
  Rect,
  Viewport,
} from "forks/xyflow/core/types";
import type { CSSProperties } from "react";
import type { EdgeHandlePosition } from "state/definitions";
import type { Position } from "utils/generatedTypes";

export type CanvasFlowViewport = Viewport;

export type CanvasFlowSize = {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  pixelRatio: number;
};

export type CanvasFlowNode = Node;

export type CanvasFlowNodeElementMap = Map<string, HTMLElement>;

export type CanvasFlowNodeDrawRecord = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

export type CanvasFlowPaintStats = {
  edgeCount: number;
  edgeDrawMs: number;
  snapshotCacheHitCount: number;
  snapshotCacheMissCount: number;
  snapshotCaptureMs: number;
  visibleNodeCount: number;
  drawnNodeCount: number;
  registeredNodeCount: number;
  mountedNodeCount: number;
  drawElementImageMs: number;
  visibilityScanMs: number;
  transformAssignmentMs: number;
  totalPaintMs: number;
};

export type CanvasFlowElementImage = {
  close: () => void;
  height: number;
  width: number;
};

export type CanvasFlowRenderingContext = CanvasRenderingContext2D & {
  drawElementImage: (
    element: Element | CanvasFlowElementImage,
    x: number,
    y: number,
    width?: number,
    height?: number,
  ) => DOMMatrix;
};

export type CanvasFlowCanvasElement = HTMLCanvasElement & {
  captureElementImage?: (element: Element) => CanvasFlowElementImage;
  requestPaint: () => void;
};

export type CanvasFlowEdgePathKind =
  | "data"
  | "agentic"
  | "state-machine"
  | "state-machine-prompt";

export type CanvasFlowEdgePathType = "bezier" | "straight";

export type CanvasFlowDrawableEdge = {
  id: string;
  kind: CanvasFlowEdgePathKind;
  pathType: CanvasFlowEdgePathType;
  source: Position;
  target: Position;
  sourceSectionId?: string | undefined;
  sourceHandleId?: string | undefined;
  targetSectionId?: string | undefined;
  targetHandleId?: string | undefined;
  sourcePosition?: HandlePosition | undefined;
  targetPosition?: HandlePosition | undefined;
  selected?: boolean | undefined;
  animated?: boolean | undefined;
  missing?: boolean | undefined;
  reconnectable?: boolean | undefined;
  selectable?: boolean | undefined;
  style?: CSSProperties | undefined;
  label?: string | undefined;
  zIndex: number;
};

export type CanvasFlowHandlePosition = EdgeHandlePosition;

export type CanvasFlowVisibleRect = Rect;

export type CanvasFlowConnectionState = {
  connectionStartHandle: ConnectingHandle | null;
  connectionPosition: Position;
  connectionStatus: ConnectionStatus | null;
};

export type CanvasFlowRenderInputs = {
  connectionState: CanvasFlowConnectionState;
  darkMode: boolean;
  edges: CanvasFlowDrawableEdge[];
  edgeHandlePositions: Record<string, CanvasFlowHandlePosition>;
  gridSize: number;
  nodeElements: CanvasFlowNodeElementMap;
  nodes: CanvasFlowNode[];
  showGridLines: boolean;
  size: CanvasFlowSize;
  viewport: CanvasFlowViewport;
  wireColor: string;
};

export type CanvasFlowRendererMode = "2d" | "webgl-texture-nodes";

export type CanvasFlowRenderer = {
  destroy: () => void;
  handleCanvasPaint: (event: Event) => void;
  markNodesDirty: (
    nodeIds: ReadonlySet<string> | "all",
    reason: string,
  ) => void;
  requestFrame: (reason: string) => void;
  resize: (size: CanvasFlowSize) => void;
  updateInputs: (inputs: CanvasFlowRenderInputs) => void;
};

type CanvasFlowTexElementImage2DArgs = [
  target: number,
  level: number,
  internalformat: number,
  format: number,
  type: number,
  element: Element,
];

export type CanvasFlowWebglRenderingContext = WebGLRenderingContext & {
  texElementImage2D: (...args: CanvasFlowTexElementImage2DArgs) => void;
};

export type CanvasFlowNodeTextureEntry = {
  cssHeight: number;
  cssWidth: number;
  dirty: boolean;
  estimatedBytes: number;
  lastUsedFrame: number;
  nodeId: string;
  texture: WebGLTexture;
  uploadCount: number;
};
