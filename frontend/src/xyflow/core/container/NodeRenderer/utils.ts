import type { ComponentType } from "react";

import wrapNode from "../../components/Nodes/wrapNode";
import type { NodeProps, NodeTypes, NodeTypesWrapped } from "../../types";

export type CreateNodeTypes = (nodeTypes: NodeTypes) => NodeTypesWrapped;

export function createNodeTypes(nodeTypes: NodeTypes): NodeTypesWrapped {
  const wrappedTypes = {} as NodeTypesWrapped;
  const specialTypes: NodeTypesWrapped = Object.keys(nodeTypes)
    .filter((k) => !["input", "default", "output", "group"].includes(k))
    .reduce((res, key) => {
      res[key] = wrapNode(nodeTypes[key] as ComponentType<NodeProps>);

      return res;
    }, wrappedTypes);

  return {
    ...specialTypes,
  };
}
