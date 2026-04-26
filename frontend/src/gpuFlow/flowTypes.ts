import type { CSSProperties } from "react";
import type { Position } from "utils/generatedTypes";

export interface Dimensions {
  width: number;
  height: number;
}

export interface Rect extends Dimensions, Position {}

export interface Box extends Position {
  x2: number;
  y2: number;
}

export type Transform = [number, number, number];

export type CoordinateExtent = [[number, number], [number, number]];

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type Node = {
  id: string;
  position: Position;
  width: number | null;
  height: number | null;
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

export type FitViewOptions = {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
  duration?: number;
  nodes?: (Partial<Node> & { id: Node["id"] })[];
};

export type HandleType = "source" | "target";

export enum HandlePosition {
  Left = "left",
  Right = "right",
}

export type Connection = {
  source: string | null;
  target: string | null;
  sourceHandle: string | null;
  targetHandle: string | null;
};

export type ConnectingHandle = {
  sectionId: string;
  type: HandleType;
  handleId: string | null;
};

export type ConnectionStatus = "valid" | "invalid";

export enum ConnectionMode {
  Strict = "strict",
  Loose = "loose",
}

export type HandleProps = {
  type: HandleType;
  position: HandlePosition;
  id?: string;
  isConnectable?: boolean;
  isConnectableStart?: boolean;
  isConnectableEnd?: boolean;
  connectionStartSemanticType?: HandleType;
  isValidConnection?: (connection: Connection) => boolean;
  onConnect?: (connection: Connection) => void;
};
