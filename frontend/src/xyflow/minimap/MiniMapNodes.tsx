/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo } from "react";
import { useNodeInternals } from "state/definitions/nodeInternals";
import MiniMapNode from "./MiniMapNode";
import type { GetMiniMapNodeAttribute, MiniMapNodesType } from "./types";

declare const window: any;

const selectorNodes = (s) =>
  s.getNodes().filter((node) => node.width && node.height);
const getAttrFunction = (func: any): GetMiniMapNodeAttribute =>
  func instanceof Function ? func : () => func;

function _MiniMapNodesReactive(props: MiniMapNodesType) {
  const nodes = useNodeInternals(selectorNodes);
  return <MiniMapNodes nodes={nodes} {...props} />;
}

export const MiniMapNodesReactive = memo(_MiniMapNodesReactive);

function _MiniMapNodes({
  nodes,
  nodeStrokeColor = "transparent",
  nodeColor = "#e2e2e2",
  nodeClassName = "",
  nodeBorderRadius = 5,
  nodeStrokeWidth = 2,
  // We need to rename the prop to be `CapitalCase` so that JSX will render it as
  // a component properly.
  nodeComponent: NodeComponent = MiniMapNode,
  onClick,
}: MiniMapNodesType) {
  const nodeColorFunc = getAttrFunction(nodeColor);
  const nodeStrokeColorFunc = getAttrFunction(nodeStrokeColor);
  const nodeClassNameFunc = getAttrFunction(nodeClassName);

  const shapeRendering =
    typeof window === "undefined" || !!window.chrome
      ? "crispEdges"
      : "geometricPrecision";

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
            style={node.style}
            selected={node.selected}
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
