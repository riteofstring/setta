/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  D3DragEvent,
  Selection as D3Selection,
  SubjectPosition,
  ZoomBehavior,
} from "d3";
import type { ComponentType, MemoExoticComponent } from "react";

import type { NodeChange } from "./changes";
import type { ReactFlowInstance } from "./instance";
import type {
  Node,
  NodeDimensionUpdate,
  NodeDragHandler,
  NodeDragItem,
  NodeInternals,
  NodeOrigin,
  NodeProps,
  SelectionDragHandler,
  WrapNodeProps,
} from "./nodes";
import type { CoordinateExtent, Rect, Transform, XYPosition } from "./utils";

export type NodeTypes = { [key: string]: ComponentType<NodeProps> };
export type NodeTypesWrapped = {
  [key: string]: MemoExoticComponent<ComponentType<WrapNodeProps>>;
};
export type FitView = (fitViewOptions?: FitViewOptions) => boolean;

export type Project = (position: XYPosition) => XYPosition;

export type OnNodesChange = (changes: NodeChange[]) => void;

export type OnNodesDelete = (nodes: Node[]) => void;

export type OnMove = (
  event: MouseEvent | TouchEvent,
  viewport: Viewport,
) => void;
export type OnMoveStart = OnMove;
export type OnMoveEnd = OnMove;

export type ZoomInOut = (options?: ViewportHelperFunctionOptions) => void;
export type ZoomTo = (
  zoomLevel: number,
  options?: ViewportHelperFunctionOptions,
) => void;
export type GetZoom = () => number;
export type GetViewport = () => Viewport;
export type SetViewport = (
  viewport: Viewport,
  options?: ViewportHelperFunctionOptions,
) => void;
export type SetCenter = (
  x: number,
  y: number,
  options?: SetCenterOptions,
) => void;
export type FitBounds = (bounds: Rect, options?: FitBoundsOptions) => void;

export type OnInit<NodeData = any> = (
  reactFlowInstance: ReactFlowInstance<NodeData>,
) => void;

export type FitViewOptions = {
  padding?: number;
  includeHiddenNodes?: boolean;
  minZoom?: number;
  maxZoom?: number;
  duration?: number;
  nodes?: (Partial<Node> & { id: Node["id"] })[];
};

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type KeyCode = string | Array<string>;

export type SnapGrid = [number, number];

export enum PanOnScrollMode {
  Free = "free",
  Vertical = "vertical",
  Horizontal = "horizontal",
}

export type ViewportHelperFunctionOptions = {
  duration?: number;
};

export type SetCenterOptions = ViewportHelperFunctionOptions & {
  zoom?: number;
};

export type FitBoundsOptions = ViewportHelperFunctionOptions & {
  padding?: number;
};

export type UnselectNodesAndEdgesParams = {
  nodes?: Node[];
};

export type OnViewportChange = (viewport: Viewport) => void;

export type ViewportHelperFunctions = {
  zoomIn: ZoomInOut;
  zoomOut: ZoomInOut;
  zoomTo: ZoomTo;
  getZoom: GetZoom;
  setViewport: SetViewport;
  getViewport: GetViewport;
  fitView: FitView;
  setCenter: SetCenter;
  fitBounds: FitBounds;
  project: Project;
  screenToFlowPosition: (position: XYPosition) => XYPosition;
  flowToScreenPosition: (position: XYPosition) => XYPosition;
  viewportInitialized: boolean;
};

export type ReactFlowStore = {
  width: number;
  height: number;
  transform: Transform;
  nodeInternals: NodeInternals;
  onNodesChange: OnNodesChange | null;
  hasDefaultNodes: boolean;
  domNode: HTMLDivElement | null;
  paneDragging: boolean;
  noPanClassName: string;

  d3Zoom: ZoomBehavior<Element, unknown> | null;
  d3Selection: D3Selection<Element, unknown, null, undefined> | null;
  d3ZoomHandler: ((this: Element, event: any, d: unknown) => void) | undefined;
  minZoom: number;
  maxZoom: number;
  translateExtent: CoordinateExtent;
  nodeOrigin: NodeOrigin;
  nodeDragThreshold: number;

  nodesSelectionActive: boolean;
  userSelectionActive: boolean;
  userSelectionRect: SelectionRect | null;

  snapToGrid: boolean;
  snapGrid: SnapGrid;

  nodesDraggable: boolean;
  nodesFocusable: boolean;
  elementsSelectable: boolean;

  multiSelectionActive: boolean;

  onNodeDragStart?: NodeDragHandler;
  onNodeDragStop?: NodeDragHandler;

  onSelectionDragStart?: SelectionDragHandler;
  onSelectionDragStop?: SelectionDragHandler;

  fitViewOnInit: boolean;
  fitViewOnInitDone: boolean;
  fitViewOnInitOptions: FitViewOptions | undefined;

  onNodesDelete?: OnNodesDelete;
  onError?: OnError;

  // event handlers
  onViewportChangeStart?: OnViewportChange;
  onViewportChange?: OnViewportChange;
  onViewportChangeEnd?: OnViewportChange;

  onSelectionChange: OnSelectionChangeFunc[];

  autoPanOnNodeDrag: boolean;
};

export type ReactFlowActions = {
  setNodes: (nodes: Node[]) => void;
  getNodes: () => Node[];
  setDefaultNodesAndEdges: (nodes?: Node[]) => void;
  updateNodeDimensions: (updates: NodeDimensionUpdate[]) => void;
  updateNodePositions: (
    nodeDragItems: NodeDragItem[] | Node[],
    positionChanged: boolean,
    dragging: boolean,
  ) => void;
  resetSelectedElements: () => void;
  unselectNodesAndEdges: (params?: UnselectNodesAndEdgesParams) => void;
  addSelectedNodes: (nodeIds: string[]) => void;
  setMinZoom: (minZoom: number) => void;
  setMaxZoom: (maxZoom: number) => void;
  setTranslateExtent: (translateExtent: CoordinateExtent) => void;
  reset: () => void;
  triggerNodeChanges: (changes: NodeChange[]) => void;
  panBy: (delta: XYPosition) => boolean;
};

export type ReactFlowState = ReactFlowStore & ReactFlowActions;

export type UpdateNodeInternals = (nodeId: string | string[]) => void;

export type OnSelectionChangeParams = {
  nodes: Node[];
};

export type OnSelectionChangeFunc = (params: OnSelectionChangeParams) => void;

export type PanelPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type UseDragEvent = D3DragEvent<HTMLDivElement, null, SubjectPosition>;

export enum SelectionMode {
  Partial = "partial",
  Full = "full",
}

export type SelectionRect = Rect & {
  startX: number;
  startY: number;
};

export type OnError = (id: string, message: string) => void;
