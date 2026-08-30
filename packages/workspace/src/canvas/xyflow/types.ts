import type {
  Node as XyflowNode,
  NodeChange,
  ReactFlowInstance,
  Viewport,
  XYPosition,
} from "@xyflow/react";

type WorkspaceXyflowNodeData = {
  sectionId: string;
};

export type WorkspaceXyflowSectionNode = XyflowNode<
  WorkspaceXyflowNodeData,
  "workspace"
>;

export type WorkspaceXyflowNodeChange = NodeChange<WorkspaceXyflowSectionNode>;

export type WorkspaceXyflowInstance =
  ReactFlowInstance<WorkspaceXyflowSectionNode>;

export type WorkspaceXyflowViewport = Viewport;

export type WorkspaceXyflowPosition = XYPosition;
