import type { D3DragEvent, SubjectPosition } from "d3-drag";
import type { Selection as D3Selection } from "d3-selection";
import type { ZoomBehavior } from "d3-zoom";
import type { Node, Position } from "../document/types";

// Canvas-slice types extracted from the reference fork (`forks/xyflow/core/types/`). The
// connection/edge/handle types left with the excluded edge features.
export type Transform = [number, number, number];

export type CoordinateExtent = [[number, number], [number, number]];

export interface Dimensions {
  width: number;
  height: number;
}

export interface Rect extends Dimensions, Position {}

export interface Box extends Position {
  x2: number;
  y2: number;
}

export type PanOnScrollMode = "free" | "vertical" | "horizontal";

export type SelectionMode = "partial" | "full";

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
  transform: Transform;
  domNode: HTMLDivElement | null;
  paneDragging: boolean;
  viewportInteractionActive: boolean;

  d3Zoom: ZoomBehavior<Element, unknown> | null;
  d3Selection: D3Selection<Element, unknown, null, undefined> | null;
  d3ZoomHandler: ((this: Element, event: WheelEvent, d: unknown) => void) | undefined;
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

export type UseDragEvent = D3DragEvent<HTMLDivElement, null, SubjectPosition>;

export type NodeDragItem = {
  id: string;
  position: Position;
  // distance from the mouse cursor to the node when start dragging
  distance: Position;
  width?: number | null;
  height?: number | null;
  dragging?: boolean;
};
