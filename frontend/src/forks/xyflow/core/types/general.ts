import type {
  D3DragEvent,
  Selection as D3Selection,
  SubjectPosition,
  ZoomBehavior,
} from "d3";

import { Position } from "utils/generatedTypes";
import type {
  ConnectingHandle,
  ConnectionMode,
  ConnectionStatus,
} from "./edges";
import type { Node } from "./nodes";
import type { CoordinateExtent, Rect, Transform } from "./utils";

export type FitViewOptions = {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
  duration?: number;
  nodes?: (Partial<Node> & { id: Node["id"] })[];
};

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type ReactFlowStore = {
  width: number;
  height: number;
  transform: Transform;
  renderTransform: Transform;
  domNode: HTMLDivElement | null;
  paneDragging: boolean;

  d3Zoom: ZoomBehavior<Element, unknown> | null;
  d3Selection: D3Selection<Element, unknown, null, undefined> | null;
  d3ZoomHandler:
    | ((this: Element, event: WheelEvent, d: unknown) => void)
    | undefined;
  translateExtent: CoordinateExtent;
  nodeDragThreshold: number;

  nodesSelectionDims: {
    width: number;
    height: number;
    x: number;
    y: number;
  } | null;
  userSelectionActive: boolean;
  userSelectionRect: SelectionRect | null;

  multiSelectionActive: boolean;
  selectionKeyPressed: boolean;
  zoomActivationKeyPressed: boolean;

  fitViewOnInit: boolean;
  fitViewOnInitDone: boolean;
  fitViewOnInitOptions: FitViewOptions | undefined;

  autoPanOnNodeDrag: boolean;

  connectionStartHandle: ConnectingHandle | null;
  connectionEndHandle: ConnectingHandle | null;
  connectionPosition: Position;
  connectionStatus: ConnectionStatus | null;
  connectionMode: ConnectionMode;
  autoPanOnConnect: boolean;
  connectionRadius: number;
};

type ReactFlowActions = {
  setMinZoom: (minZoom: number) => void;
  setMaxZoom: (maxZoom: number) => void;
  setTranslateExtent: (translateExtent: CoordinateExtent) => void;
  reset: () => void;
  panBy: (delta: Position) => boolean;
  cancelConnection: () => void;
};

export type ReactFlowState = ReactFlowStore & ReactFlowActions;

export type PanelPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type UseDragEvent = D3DragEvent<HTMLDivElement, null, SubjectPosition>;

type SelectionRect = Rect & {
  startX: number;
  startY: number;
};
