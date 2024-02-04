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
  NodeOrigin,
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
  ProOptions,
  SelectionDragHandler,
  SelectionMode,
  Viewport,
} from ".";

export type ReactFlowProps = Omit<HTMLAttributes<HTMLDivElement>, "onError"> & {
  nodes?: Node[];
  defaultNodes?: Node[];
  onNodeClick?: NodeMouseHandler;
  onNodeDoubleClick?: NodeMouseHandler;
  onNodeMouseEnter?: NodeMouseHandler;
  onNodeMouseMove?: NodeMouseHandler;
  onNodeMouseLeave?: NodeMouseHandler;
  onNodeContextMenu?: NodeMouseHandler;
  onNodeDragStart?: NodeDragHandler;
  onNodeDrag?: NodeDragHandler;
  onNodeDragStop?: NodeDragHandler;
  onNodesChange?: OnNodesChange;
  onNodesDelete?: OnNodesDelete;
  onSelectionDragStart?: SelectionDragHandler;
  onSelectionDrag?: SelectionDragHandler;
  onSelectionDragStop?: SelectionDragHandler;
  onSelectionStart?: (event: ReactMouseEvent) => void;
  onSelectionEnd?: (event: ReactMouseEvent) => void;
  onSelectionContextMenu?: (event: ReactMouseEvent, nodes: Node[]) => void;
  onInit?: OnInit;
  onMove?: OnMove;
  onMoveStart?: OnMoveStart;
  onMoveEnd?: OnMoveEnd;
  onSelectionChange?: OnSelectionChangeFunc;
  onPaneScroll?: (event?: WheelEvent) => void;
  onPaneClick?: (event: ReactMouseEvent) => void;
  onPaneContextMenu?: (event: ReactMouseEvent) => void;
  onPaneMouseEnter?: (event: ReactMouseEvent) => void;
  onPaneMouseMove?: (event: ReactMouseEvent) => void;
  onPaneMouseLeave?: (event: ReactMouseEvent) => void;
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
  onlyRenderVisibleElements?: boolean;
  nodesDraggable?: boolean;
  nodesFocusable?: boolean;
  nodeOrigin?: NodeOrigin;
  initNodeOrigin?: NodeOrigin;
  elementsSelectable?: boolean;
  selectNodesOnDrag?: boolean;
  panOnDrag?: boolean | number[];
  minZoom?: number;
  maxZoom?: number;
  defaultViewport?: Viewport;
  translateExtent?: CoordinateExtent;
  preventScrolling?: boolean;
  nodeExtent?: CoordinateExtent;
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
  proOptions?: ProOptions;
  disableKeyboardA11y?: boolean;
  autoPanOnNodeDrag?: boolean;
  onError?: OnError;
  nodeDragThreshold?: number;
};

export type ReactFlowRefType = HTMLDivElement;
