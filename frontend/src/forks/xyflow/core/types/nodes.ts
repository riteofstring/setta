import type { CSSProperties } from "react";
import { Position } from "utils/generatedTypes";

// interface for the user node items
export type Node = {
  id: string;
  position: Position;
  width: number | null;
  height: number | null;
  sizeAuthority?: "layout" | "none" | "sectionModel" | "sharedNode";
  zIndex: number;
  tempZIndex: number;
  type?: string;
  style?: CSSProperties;
};

export type NodeDragItem = {
  id: string;
  position: Position;
  // distance from the mouse cursor to the node when start dragging
  distance: Position;
  width?: number | null;
  height?: number | null;
  dragging?: boolean;
};
