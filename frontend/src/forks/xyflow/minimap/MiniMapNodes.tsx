import { memo } from "react";
import { getNodes } from "state/actions/nodeInternals";
import {
  useNodeInternals,
  type ZustandNodeInternalsState,
} from "state/definitions";
import type { Node } from "../core/types";
import { useReactFlow } from "../core/store";
import { computeReadyToBeVisible } from "../core/store/utils";
import MiniMapNode from "./MiniMapNode";
import type { GetMiniMapNodeAttribute, MiniMapNodesType } from "./types";

const selectorNodes = (s: ZustandNodeInternalsState) =>
  getNodes(s).filter((node) => node.width && node.height);

export function areMiniMapNodesGeometriesEqual(left: Node[], right: Node[]) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftNode = left[index];
    const rightNode = right[index];
    if (!leftNode || !rightNode) {
      return false;
    }
    if (
      leftNode.id !== rightNode.id ||
      leftNode.position.x !== rightNode.position.x ||
      leftNode.position.y !== rightNode.position.y ||
      leftNode.width !== rightNode.width ||
      leftNode.height !== rightNode.height
    ) {
      return false;
    }
  }
  return true;
}

const getAttrFunction = (
  func: string | GetMiniMapNodeAttribute,
): GetMiniMapNodeAttribute => (typeof func === "function" ? func : () => func);

function _MiniMapNodesReactive(props: MiniMapNodesType) {
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);
  const nodes = useNodeInternals(selectorNodes, areMiniMapNodesGeometriesEqual);
  if (readyToBeVisible) {
    return <MiniMapNodes nodes={nodes} {...props} />;
  }
  return null;
}

export const MiniMapNodesReactive = memo(_MiniMapNodesReactive);

function _MiniMapNodes({
  nodes,
  nodeStrokeColor = "transparent",
  nodeColor = "#e2e2e2",
  nodeClassName = "",
  nodeBorderRadius = 5,
  nodeStrokeWidth = 2,
  nodeComponent: NodeComponent = MiniMapNode,
  onClick,
}: MiniMapNodesType & { nodes: Node[] }) {
  const nodeColorFunc = getAttrFunction(nodeColor);
  const nodeStrokeColorFunc = getAttrFunction(nodeStrokeColor);
  const nodeClassNameFunc = getAttrFunction(nodeClassName);

  const isBrowser = typeof window !== "undefined";
  const isChrome = isBrowser && "chrome" in window;
  const shapeRendering =
    !isBrowser || isChrome ? "crispEdges" : "geometricPrecision";

  return (
    <>
      {nodes.map((node, idx) => {
        const { x, y } = node.position;

        return (
          <NodeComponent
            key={`${node.id ?? idx}`}
            x={x}
            y={y}
            width={node.width!}
            height={node.height!}
            className={nodeClassNameFunc(node)}
            color={nodeColorFunc(node)}
            borderRadius={nodeBorderRadius}
            strokeColor={nodeStrokeColorFunc(node)}
            strokeWidth={nodeStrokeWidth}
            shapeRendering={shapeRendering}
            onClick={onClick}
            id={node.id}
          />
        );
      })}
    </>
  );
}

export const MiniMapNodes = memo(_MiniMapNodes);
