import type {
  ComponentType,
  CSSProperties,
  HTMLAttributes,
  MouseEvent,
} from "react";
import { Position } from "utils/generatedTypes";
import type { Node, PanelPosition } from "../core/types";

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
  onNodeClick?: (event: MouseEvent, node: Node) => void;
  pannable?: boolean;
  zoomable?: boolean;
  ariaLabel?: string | null;
  inversePan?: boolean;
  zoomStep?: number;
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
