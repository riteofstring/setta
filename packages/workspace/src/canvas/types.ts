import type { Node, Position } from "../document/types";

export type Transform = [number, number, number];

export type CoordinateExtent = [[number, number], [number, number]];

export interface Dimensions {
  width: number;
  height: number;
}

export interface Rect extends Dimensions, Position {}

export type ViewportInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export interface Box extends Position {
  x2: number;
  y2: number;
}

export type PanOnScrollMode = "free" | "vertical" | "horizontal";

export type SelectionMode = "partial" | "full";

export type PanelPosition = "bottom-left" | "bottom-right";

export type FitViewOptions = {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
  duration?: number;
  nodes?: Array<Partial<Node> & { id: Node["id"] }>;
};

type SelectionRect = Rect & {
  startX: number;
  startY: number;
};

export type ReactFlowStore = {
  width: number;
  height: number;
  viewportInsets: ViewportInsets;
  transform: Transform;
  domNode: HTMLDivElement | null;
  paneDragging: boolean;
  isPanScrolling: boolean;
  viewportInteractionActive: boolean;

  translateExtent: CoordinateExtent;
  nodeDragThreshold: number;

  nodesSelectionDims: Rect | null;
  userSelectionActive: boolean;
  userSelectionRect: SelectionRect | null;

  multiSelectionActive: boolean;
  selectionKeyPressed: boolean;
  zoomActivationKeyPressed: boolean;
  panActivationKeyPressed: boolean;

  fitViewOnInit: boolean;
  fitViewOnInitDone: boolean;
  fitViewOnInitOptions: FitViewOptions | undefined;

  autoPanOnNodeDrag: boolean;
};

type ReactFlowActions = {
  setNodesSelection: (selectedNodesCount: number, ignoreGrid?: boolean) => void;
  shiftNodesSelection: (delta: Position) => void;
  panBy: (delta: Position) => boolean;
};

export type ReactFlowState = ReactFlowStore & ReactFlowActions;

export type NodeDragItem = {
  id: string;
  position: Position;

  distance: Position;
  width?: number | null;
  height?: number | null;
  dragging?: boolean;
};
