import type { HTMLAttributes, MouseEvent as ReactMouseEvent } from "react";

import type {
  CoordinateExtent,
  FitViewOptions,
  KeyCode,
  Node,
  NodeTypes,
  OnError,
  OnInit,
  OnMoveEnd,
  OnMoveStart,
  OnNodesChange,
  OnSelectionChangeFunc,
  PanOnScrollMode,
  SelectionMode,
  Viewport,
} from ".";

export type ReactFlowProps = Omit<HTMLAttributes<HTMLDivElement>, "onError"> & {
  nodes?: Node[];
  onNodesChange?: OnNodesChange;
  onSelectionStart?: (event: ReactMouseEvent) => void;
  onSelectionEnd?: (event: ReactMouseEvent) => void;
  onInit?: OnInit;
  onMoveStart?: OnMoveStart;
  onMoveEnd?: OnMoveEnd;
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
