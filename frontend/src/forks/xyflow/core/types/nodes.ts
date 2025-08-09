/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MouseEvent as ReactMouseEvent } from "react";

import type { XYPosition } from ".";

// interface for the user node items
export type Node = {
  id: string;
  position: XYPosition;
  width?: number | null;
  height?: number | null;
  zIndex: number;
  tempZIndex: number;
};

export type NodeMouseHandler = (event: ReactMouseEvent, node: Node) => void;
export type NodeDragHandler = (
  event: ReactMouseEvent,
  node: Node,
  nodes: Node[],
) => void;
export type SelectionDragHandler = (
  event: ReactMouseEvent,
  nodes: Node[],
) => void;

export type WrapNodeProps<T = any> = Pick<Node<T>, "id" | "style"> & {
  xPos: number;
  yPos: number;
  isDraggable: boolean;
  resizeObserver: ResizeObserver | null;
  zIndex: number;
};

export type NodeDimensionUpdate = {
  id: string;
  nodeElement: HTMLDivElement;
  forceUpdate?: boolean;
};

export type NodeInternals = Map<string, Node>;

export type NodeBounds = XYPosition & {
  width: number | null;
  height: number | null;
};

export type NodeDragItem = {
  id: string;
  position: XYPosition;
  // distance from the mouse cursor to the node when start dragging
  distance: XYPosition;
  width?: number | null;
  height?: number | null;
  dragging?: boolean;
};
