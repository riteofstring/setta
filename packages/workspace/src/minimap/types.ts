import type {
  ComponentType,
  CSSProperties,
  HTMLAttributes,
  MouseEvent,
} from "react";
import type { PanelPosition } from "../canvas/types";
import type { Node, Position } from "../document/types";

export type GetMiniMapNodeAttribute = (node: Node) => string;

export type MiniMapProps = Omit<HTMLAttributes<SVGSVGElement>, "onClick"> & {
  nodeColor?: string | GetMiniMapNodeAttribute;
  nodeStrokeColor?: string | GetMiniMapNodeAttribute;
  nodeClassName?: string | GetMiniMapNodeAttribute;
  nodeBorderRadius?: number;
  nodeStrokeWidth?: number;
  nodeComponent?: ComponentType<MiniMapNodeProps>;
  maskColor?: string;
  maskStrokeColor?: string;
  maskStrokeWidth?: number;
  position?: PanelPosition;
  onClick?: (event: MouseEvent, position: Position) => void;
  onNavigate?: (position: Position) => void;
  pannable?: boolean;
  offsetScale?: number;
};

export type MiniMapNodesType = Pick<
  MiniMapProps,
  | "nodeColor"
  | "nodeStrokeColor"
  | "nodeClassName"
  | "nodeBorderRadius"
  | "nodeStrokeWidth"
  | "nodeComponent"
> & {
  onClick?: (event: MouseEvent, nodeId: string) => void;
};

export type MiniMapNodeProps = {
  id: string;
  dataMinimapNodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
  className: string;
  color: string;
  shapeRendering: string;
  strokeColor: string;
  strokeWidth: number;
  style?: CSSProperties;
  onClick?: (event: MouseEvent, id: string) => void;
};
