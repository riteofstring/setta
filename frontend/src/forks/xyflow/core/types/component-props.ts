import type {
  CoordinateExtent,
  FitViewOptions,
  KeyCode,
  Node,
  PanOnScrollMode,
  SelectionMode,
} from ".";

export type ReactFlowProps = {
  nodes?: Node[];
  selectionKeyCode?: KeyCode | null;
  selectionOnDrag?: boolean;
  selectionMode?: SelectionMode;
  panActivationKeyCode?: KeyCode | null;
  multiSelectionKeyCode?: KeyCode | null;
  zoomActivationKeyCode?: KeyCode | null;
  nodesDraggable?: boolean;
  nodesFocusable?: boolean;
  elementsSelectable?: boolean;
  selectNodesOnDrag?: boolean;
  panOnDrag?: boolean | number[];
  minZoom?: number;
  maxZoom?: number;
  translateExtent?: CoordinateExtent;
  preventScrolling?: boolean;
  zoomOnScroll?: boolean;
  zoomOnPinch?: boolean;
  panOnScroll?: boolean;
  panOnScrollSpeed?: number;
  panOnScrollMode?: PanOnScrollMode;
  zoomOnDoubleClick?: boolean;
  noDragClassName?: string;
  noWheelClassName?: string;
  noPanClassName?: string;
  fitView?: boolean;
  fitViewOptions?: FitViewOptions;
  autoPanOnNodeDrag?: boolean;
  nodeDragThreshold?: number;
};

export type ReactFlowRefType = HTMLDivElement;
