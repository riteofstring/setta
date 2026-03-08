import type {
  CSSProperties,
  HTMLAttributes,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";

export type HandleType = "source" | "target";

export enum HandlePosition {
  Left = "left",
  Right = "right",
  Top = "top",
  Bottom = "bottom",
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

type EdgeLabelOptions = {
  label?: string | ReactNode;
  labelStyle?: CSSProperties;
  labelShowBg?: boolean;
  labelBgStyle?: CSSProperties;
  labelBgPadding?: [number, number];
  labelBgBorderRadius?: number;
};

export type EdgeProps = EdgeLabelOptions & {
  id: string;
  type?: string;
  className?: string;
  source: string;
  target: string;
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: HandlePosition;
  targetPosition: HandlePosition;
  selected?: boolean;
  animated?: boolean;
  style?: CSSProperties;
  data?: Record<string, unknown> | null;
  interactionWidth?: number;
  markerStart?: string;
  markerEnd?: string;
  pathOptions?: Record<string, unknown>;
};

export type BaseEdgeProps = EdgeLabelOptions & {
  id?: string;
  path: string;
  labelX?: number;
  labelY?: number;
  style?: CSSProperties;
  markerStart?: string;
  markerEnd?: string;
  interactionWidth?: number;
};

export type BezierEdgeProps = EdgeProps & {
  pathOptions?: { curvature?: number };
};

export type EdgeTextProps = HTMLAttributes<SVGElement> &
  EdgeLabelOptions & {
    x: number;
    y: number;
  };

type EdgeMouseHandler = (
  event: ReactMouseEvent<SVGGElement, MouseEvent>,
  edgeId: string,
) => void;

export type HandleProps = {
  type: HandleType;
  position: HandlePosition;
  id?: string;
  isConnectable?: boolean;
  isConnectableStart?: boolean;
  isConnectableEnd?: boolean;
  isValidConnection?: (connection: Connection) => boolean;
  onConnect?: (connection: Connection) => void;
};

export type WrapEdgeProps = EdgeProps & {
  className?: string;
  elementsSelectable?: boolean;
  hidden?: boolean;
  reconnectRadius?: number;
  onReconnect?: (connection: Connection) => void;
  isReconnectable?: boolean;
};

enum ConnectionLineType {
  Bezier = "bezier",
  Straight = "straight",
}
