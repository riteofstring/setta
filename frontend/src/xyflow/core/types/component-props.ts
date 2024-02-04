import type {
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
  WheelEvent,
} from "react";

import type {
  CoordinateExtent,
  FitViewOptions,
  KeyCode,
  Node,
  NodeDragHandler,
  NodeMouseHandler,
  NodeTypes,
  OnError,
  OnInit,
  OnMove,
  OnMoveEnd,
  OnMoveStart,
  OnNodesChange,
  OnNodesDelete,
  OnSelectionChangeFunc,
  PanOnScrollMode,
  SelectionDragHandler,
  SelectionMode,
  Viewport,
} from ".";

export type ReactFlowProps = Omit<HTMLAttributes<HTMLDivElement>, "onError"> & {
  nodes?: Node[];
  onNodeContextMenu?: NodeMouseHandler;
  onNodeDragStart?: NodeDragHandler;
  onNodeDragStop?: NodeDragHandler;
  onNodesChange?: OnNodesChange;
  onNodesDelete?: OnNodesDelete;
  onSelectionDragStop?: SelectionDragHandler;
  onSelectionStart?: (event: ReactMouseEvent) => void;
  onSelectionEnd?: (event: ReactMouseEvent) => void;
  onSelectionContextMenu?: (event: ReactMouseEvent, nodes: Node[]) => void;
  onInit?: OnInit;
  onMove?: OnMove;
  onMoveStart?: OnMoveStart;
  onMoveEnd?: OnMoveEnd;
  onSelectionChange?: OnSelectionChangeFunc;
  onPaneClick?: (event: ReactMouseEvent) => void;
  onPaneContextMenu?: (event: ReactMouseEvent) => void;
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
  onError?: OnError;
  nodeDragThreshold?: number;
};

export type ReactFlowRefType = HTMLDivElement;
