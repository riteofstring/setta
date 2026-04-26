import type {
  D3DragEvent,
  Selection as D3Selection,
  SubjectPosition,
  ZoomBehavior,
} from "d3";

import type {
  ConnectingHandle,
  ConnectionMode,
  ConnectionStatus,
  CoordinateExtent,
  FitViewOptions,
  Rect,
  Transform,
} from "gpuFlow/flowTypes";
import { Position } from "utils/generatedTypes";

export type { FitViewOptions, Viewport } from "gpuFlow/flowTypes";

export type ReactFlowStore = {
  width: number;
  height: number;
  transform: Transform;
  domNode: HTMLDivElement | null;
  paneDragging: boolean;
  viewportInteractionActive: boolean;

  d3Zoom: ZoomBehavior<Element, unknown> | null;
  d3Selection: D3Selection<Element, unknown, null, undefined> | null;
  d3ZoomHandler:
    | ((this: Element, event: WheelEvent, d: unknown) => void)
    | undefined;
  translateExtent: CoordinateExtent;
  nodeDragThreshold: number;

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

export type UseDragEvent = D3DragEvent<HTMLDivElement, null, SubjectPosition>;

type SelectionRect = Rect & {
  startX: number;
  startY: number;
};
