import { useEffect, useState } from "react";

import type { GpuFlowLayoutNode, GpuFlowLayoutStoreApi } from "./layoutStore";

export const EMPTY_GPU_FLOW_LAYOUT_NODES: readonly GpuFlowLayoutNode[] = [];

export function useGpuFlowLayoutStoreNodes(
  layoutStore: GpuFlowLayoutStoreApi | undefined,
): readonly GpuFlowLayoutNode[] | undefined {
  const [nodes, setNodes] = useState(() =>
    getGpuFlowLayoutStoreNodes(layoutStore),
  );

  useEffect(() => {
    setNodes(getGpuFlowLayoutStoreNodes(layoutStore));
    if (!layoutStore) {
      return;
    }
    return layoutStore.subscribe((state, previousState) => {
      if (
        state.nodeOrder === previousState.nodeOrder &&
        state.nodesById === previousState.nodesById
      ) {
        return;
      }
      setNodes(state.getNodes());
    });
  }, [layoutStore]);

  return nodes;
}

function getGpuFlowLayoutStoreNodes(
  layoutStore: GpuFlowLayoutStoreApi | undefined,
): readonly GpuFlowLayoutNode[] | undefined {
  return layoutStore?.getState().getNodes();
}
