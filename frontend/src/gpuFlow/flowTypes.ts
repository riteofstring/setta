import type { CSSProperties } from "react";
import type { GpuFlowScene } from "./scene";

export interface Dimensions {
  width: number;
  height: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface Rect extends Dimensions, Position {}

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

export type GpuFlowConnectionContext = {
  readonly scene?: GpuFlowScene | null | undefined;
};

export type HandleConnectionCandidate = {
  sectionId: string;
  handleId: string | null;
  type: HandleType | null;
};

export type HandleConnectionCandidateFilter = (
  candidate: HandleConnectionCandidate,
) => boolean;

export type GpuFlowAutoPanInsetsPx = {
  readonly bottom?: number | undefined;
  readonly left?: number | undefined;
  readonly right?: number | undefined;
  readonly top?: number | undefined;
};

export type GpuFlowAutoPanInsetsInput =
  | GpuFlowAutoPanInsetsPx
  | (() => GpuFlowAutoPanInsetsPx | null | undefined)
  | null
  | undefined;

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
  isConnectionCandidateAllowed?: HandleConnectionCandidateFilter;
  isValidConnection?: (connection: Connection) => boolean;
  onConnect?: (
    connection: Connection,
    context?: GpuFlowConnectionContext,
  ) => void;
  pointerUpSnapRadius?: number;
  autoPanInsetsPx?: GpuFlowAutoPanInsetsInput;
};
