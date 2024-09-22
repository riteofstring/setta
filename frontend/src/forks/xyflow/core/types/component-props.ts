import type { CoordinateExtent, Node, PanOnScrollMode, SelectionMode } from ".";

export type ReactFlowProps = {
  nodes?: Node[];
  selectionOnDrag?: boolean;
  selectionMode?: SelectionMode;
  nodesDraggable?: boolean;
  nodesFocusable?: boolean;
  elementsSelectable?: boolean;
  selectNodesOnDrag?: boolean;
  panOnDrag?: boolean | number[];
  translateExtent?: CoordinateExtent;
  preventScrolling?: boolean;
  zoomOnScroll?: boolean;
  zoomOnPinch?: boolean;
  panOnScroll?: boolean;
  panOnScrollSpeed?: number;
  panOnScrollMode?: PanOnScrollMode;
  zoomOnDoubleClick?: boolean;
  autoPanOnNodeDrag?: boolean;
};

export type ReactFlowRefType = HTMLDivElement;
