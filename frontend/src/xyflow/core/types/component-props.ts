import type {
  CoordinateExtent,
  FitViewOptions,
  KeyCode,
  Node,
  NodeTypes,
  OnNodesChange,
  PanOnScrollMode,
  SelectionMode,
  Viewport,
} from ".";

export type ReactFlowProps = {
  nodes?: Node[];
  onNodesChange?: OnNodesChange;
  nodeTypes?: NodeTypes;
  deleteKeyCode?: KeyCode | null;
  selectionKeyCode?: KeyCode | null;
  selectionOnDrag?: boolean;
  selectionMode?: SelectionMode;
  panActivationKeyCode?: KeyCode | null;
  multiSelectionKeyCode?: KeyCode | null;
  zoomActivationKeyCode?: KeyCode | null;
  snapToGrid?: boolean;
  snapGrid?: [number, number];
  nodesDraggable?: boolean;
  nodesFocusable?: boolean;
  elementsSelectable?: boolean;
  selectNodesOnDrag?: boolean;
  panOnDrag?: boolean | number[];
  minZoom?: number;
  maxZoom?: number;
  defaultViewport?: Viewport;
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
