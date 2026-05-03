import type { Node } from "gpuFlow/flowTypes";
import {
  EMPTY_GPU_FLOW_LAYOUT_NODES,
  useGpuFlowLayoutStoreNodes,
} from "gpuFlow/layoutHooks";
import {
  createGpuFlowLayoutStore,
  type GpuFlowLayoutChange,
  type GpuFlowLayoutNode,
  type GpuFlowLayoutStoreApi,
} from "gpuFlow/layoutStore";
import { useEffect, useMemo, useRef } from "react";
import {
  useNodeInternals,
  type ZustandNodeInternalsState,
} from "state/definitions";

export type ProjectGpuLayoutAdapter = {
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly nodeLayouts: readonly GpuFlowLayoutNode[];
};

export function useProjectGpuLayoutAdapter(): ProjectGpuLayoutAdapter {
  const layoutStore = useStableProjectGpuLayoutStore();
  useProjectGpuLayoutStoreProjectSync(layoutStore);
  const nodeLayouts =
    useGpuFlowLayoutStoreNodes(layoutStore) ?? EMPTY_GPU_FLOW_LAYOUT_NODES;
  return useMemo(
    () => ({ layoutStore, nodeLayouts }),
    [layoutStore, nodeLayouts],
  );
}

export function syncProjectGpuLayoutStoreFromNodeInternals(
  layoutStore: GpuFlowLayoutStoreApi,
  state: Pick<ZustandNodeInternalsState, "x">,
): GpuFlowLayoutChange {
  return layoutStore
    .getState()
    .replaceNodes(getProjectGpuLayoutNodesFromNodeInternals(state), {
      phase: "commit",
      reason: "project-sync",
    });
}

export function getProjectGpuLayoutNodesFromNodeInternals(
  state: Pick<ZustandNodeInternalsState, "x">,
): readonly GpuFlowLayoutNode[] {
  return Array.from(state.x.values(), getProjectGpuLayoutNode);
}

export function getProjectGpuLayoutNode(node: Node): GpuFlowLayoutNode {
  return {
    height: node.height,
    nodeId: node.id,
    tempZIndex: node.tempZIndex,
    width: node.width,
    x: node.position.x,
    y: node.position.y,
    zIndex: node.zIndex,
  };
}

function useStableProjectGpuLayoutStore(): GpuFlowLayoutStoreApi {
  const layoutStoreRef = useRef<GpuFlowLayoutStoreApi | null>(null);
  if (layoutStoreRef.current === null) {
    layoutStoreRef.current = createGpuFlowLayoutStore({
      nodes: getProjectGpuLayoutNodesFromNodeInternals(
        useNodeInternals.getState(),
      ),
    });
  }
  return layoutStoreRef.current;
}

function useProjectGpuLayoutStoreProjectSync(
  layoutStore: GpuFlowLayoutStoreApi,
) {
  useEffect(() => {
    syncProjectGpuLayoutStoreFromNodeInternals(
      layoutStore,
      useNodeInternals.getState(),
    );
    return useNodeInternals.subscribe((state, previousState) => {
      if (state.x === previousState.x) {
        return;
      }
      syncProjectGpuLayoutStoreFromNodeInternals(layoutStore, state);
    });
  }, [layoutStore]);
}
