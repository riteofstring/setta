import { useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { devWarn } from "xyflow/core/utils";
import { errorMessages } from "../../contants";
import { useStoreApi } from "../../hooks/useStore";
import type { NodeTypes, NodeTypesWrapped } from "../../types";
import { CreateNodeTypes } from "../NodeRenderer/utils";

export function useNodeOrEdgeTypes(
  nodeOrEdgeTypes: NodeTypes,
  createTypes: CreateNodeTypes,
): NodeTypesWrapped;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useNodeOrEdgeTypes(
  nodeOrEdgeTypes: any,
  createTypes: any,
): any {
  const typesKeysRef = useRef<string[] | null>(null);

  const typesParsed = useMemo(() => {
    if (process.env.NODE_ENV === "development") {
      const typeKeys = Object.keys(nodeOrEdgeTypes);
      if (shallow(typesKeysRef.current, typeKeys)) {
        devWarn("002", errorMessages["error002"]());
      }

      typesKeysRef.current = typeKeys;
    }
    return createTypes(nodeOrEdgeTypes);
  }, [nodeOrEdgeTypes]);

  return typesParsed;
}
