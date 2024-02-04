import type { ComponentType } from "react";

import wrapNode from "../../components/Nodes/wrapNode";
import type {
  NodeOrigin,
  NodeProps,
  NodeTypes,
  NodeTypesWrapped,
  XYPosition,
} from "../../types";

export type CreateNodeTypes = (nodeTypes: NodeTypes) => NodeTypesWrapped;

export function createNodeTypes(nodeTypes: NodeTypes): NodeTypesWrapped {
  const standardTypes: NodeTypesWrapped = {
    input: wrapNode(nodeTypes.input as ComponentType<NodeProps>),
    output: wrapNode(nodeTypes.output as ComponentType<NodeProps>),
    group: wrapNode(nodeTypes.group as ComponentType<NodeProps>),
  };

  const wrappedTypes = {} as NodeTypesWrapped;
  const specialTypes: NodeTypesWrapped = Object.keys(nodeTypes)
    .filter((k) => !["input", "default", "output", "group"].includes(k))
    .reduce((res, key) => {
      res[key] = wrapNode(nodeTypes[key] as ComponentType<NodeProps>);

      return res;
    }, wrappedTypes);

  return {
    ...standardTypes,
    ...specialTypes,
  };
}

export const getPositionWithOrigin = ({
  x,
  y,
  width,
  height,
  origin,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  origin: NodeOrigin;
}): XYPosition => {
  if (!width || !height) {
    return { x, y };
  }

  if (origin[0] < 0 || origin[1] < 0 || origin[0] > 1 || origin[1] > 1) {
    return { x, y };
  }

  return {
    x: x - width * origin[0],
    y: y - height * origin[1],
  };
};
