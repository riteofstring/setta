 

import type { XYPosition } from ".";

// interface for the user node items
export type Node = {
  id: string;
  position: XYPosition;
  width: number | null;
  height: number | null;
  zIndex: number;
  tempZIndex: number;
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
