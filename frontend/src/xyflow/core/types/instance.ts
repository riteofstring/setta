/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-namespace */
import { Node, Rect, Viewport, ViewportHelperFunctions } from ".";

export type ReactFlowJsonObject<NodeData = any> = {
  nodes: Node<NodeData>[];
  viewport: Viewport;
};

export type DeleteElementsOptions = {
  nodes?: (Partial<Node> & { id: Node["id"] })[];
};
export namespace Instance {
  export type GetNodes<NodeData> = () => Node<NodeData>[];
  export type SetNodes<NodeData> = (
    payload: Node<NodeData>[] | ((nodes: Node<NodeData>[]) => Node<NodeData>[]),
  ) => void;
  export type AddNodes<NodeData> = (
    payload: Node<NodeData>[] | Node<NodeData>,
  ) => void;
  export type GetNode<NodeData> = (id: string) => Node<NodeData> | undefined;
  export type ToObject<
    NodeData = any,
  > = () => ReactFlowJsonObject<NodeData>;
  export type DeleteElements = ({
    nodes,
  }: DeleteElementsOptions) => void;
  export type GetIntersectingNodes<NodeData> = (
    node: (Partial<Node<NodeData>> & { id: Node["id"] }) | Rect,
    partially?: boolean,
    nodes?: Node<NodeData>[],
  ) => Node<NodeData>[];
  export type IsNodeIntersecting<NodeData> = (
    node: (Partial<Node<NodeData>> & { id: Node["id"] }) | Rect,
    area: Rect,
    partially?: boolean,
  ) => boolean;
}

export type ReactFlowInstance<NodeData = any> = {
  getNodes: Instance.GetNodes<NodeData>;
  setNodes: Instance.SetNodes<NodeData>;
  addNodes: Instance.AddNodes<NodeData>;
  getNode: Instance.GetNode<NodeData>;
  toObject: Instance.ToObject<NodeData>;
  deleteElements: Instance.DeleteElements;
  getIntersectingNodes: Instance.GetIntersectingNodes<NodeData>;
  isNodeIntersecting: Instance.IsNodeIntersecting<NodeData>;
  viewportInitialized: boolean;
} & Omit<ViewportHelperFunctions, "initialized">;
