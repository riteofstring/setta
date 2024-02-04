/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";

import type { Position, XYPosition } from ".";
import { internalsSymbol } from "../utils";

// interface for the user node items
export type Node<T = any, U extends string | undefined = string | undefined> = {
  id: string;
  position: XYPosition;
  data: T;
  type?: U;
  style?: CSSProperties;
  className?: string;
  sourcePosition?: Position;
  targetPosition?: Position;
  hidden?: boolean;
  selected?: boolean;
  dragging?: boolean;
  draggable?: boolean;
  selectable?: boolean;
  deletable?: boolean;
  width?: number | null;
  height?: number | null;
  positionAbsolute?: XYPosition;
  ariaLabel?: string;
  focusable?: boolean;

  // only used internally
  [internalsSymbol]?: {
    z?: number;
  };
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

export type WrapNodeProps<T = any> = Pick<
  Node<T>,
  | "id"
  | "data"
  | "style"
  | "className"
  | "sourcePosition"
  | "targetPosition"
  | "hidden"
  | "ariaLabel"
> &
  Required<Pick<Node<T>, "selected" | "type">> & {
    xPos: number;
    yPos: number;
    initialized: boolean;
    isSelectable: boolean;
    isDraggable: boolean;
    isFocusable: boolean;
    selectNodesOnDrag: boolean;
    onClick?: NodeMouseHandler;
    onDoubleClick?: NodeMouseHandler;
    onMouseEnter?: NodeMouseHandler;
    onMouseMove?: NodeMouseHandler;
    onMouseLeave?: NodeMouseHandler;
    onContextMenu?: NodeMouseHandler;
    resizeObserver: ResizeObserver | null;
    noDragClassName: string;
    noPanClassName: string;
  };

// props that get passed to a custom node
export type NodeProps<T = any> = Pick<
  WrapNodeProps<T>,
  "id" | "data" | "type" | "selected" | "xPos" | "yPos"
> & {
  dragging: boolean;
  targetPosition?: Position;
  sourcePosition?: Position;
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
  positionAbsolute: XYPosition;
  // distance from the mouse cursor to the node when start dragging
  distance: XYPosition;
  width?: number | null;
  height?: number | null;
  dragging?: boolean;
};
