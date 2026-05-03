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
import { useEffect, useMemo } from "react";
import {
  useNodeInternals,
  type ZustandNodeInternalsState,
} from "state/definitions";

export type ProjectGpuLayoutAdapter = {
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly nodeLayouts: readonly GpuFlowLayoutNode[];
};

let projectGpuLayoutStore: GpuFlowLayoutStoreApi | null = null;
let projectGpuLayoutStoreSyncSubscriberCount = 0;
let projectGpuLayoutStoreSyncUnsubscribe: (() => void) | null = null;

export function useProjectGpuLayoutAdapter(): ProjectGpuLayoutAdapter {
  const layoutStore = useProjectGpuLayoutStore();
  const nodeLayouts =
    useGpuFlowLayoutStoreNodes(layoutStore) ?? EMPTY_GPU_FLOW_LAYOUT_NODES;
  return useMemo(
    () => ({ layoutStore, nodeLayouts }),
    [layoutStore, nodeLayouts],
  );
}

export function useProjectGpuLayoutStore(): GpuFlowLayoutStoreApi {
  const layoutStore = getProjectGpuLayoutStore();
  useProjectGpuLayoutStoreProjectSync(layoutStore);
  return layoutStore;
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

function getProjectGpuLayoutStore(): GpuFlowLayoutStoreApi {
  if (projectGpuLayoutStore === null) {
    projectGpuLayoutStore = createGpuFlowLayoutStore({
      nodes: getProjectGpuLayoutNodesFromNodeInternals(
        useNodeInternals.getState(),
      ),
    });
  }
  return projectGpuLayoutStore;
}

function useProjectGpuLayoutStoreProjectSync(
  layoutStore: GpuFlowLayoutStoreApi,
) {
  useEffect(() => {
    projectGpuLayoutStoreSyncSubscriberCount += 1;
    if (projectGpuLayoutStoreSyncSubscriberCount === 1) {
      syncProjectGpuLayoutStoreFromNodeInternals(
        layoutStore,
        useNodeInternals.getState(),
      );
      projectGpuLayoutStoreSyncUnsubscribe = useNodeInternals.subscribe(
        (state, previousState) => {
          if (state.x === previousState.x) {
            return;
          }
          syncProjectGpuLayoutStoreFromNodeInternals(layoutStore, state);
        },
      );
    }
    return () => {
      projectGpuLayoutStoreSyncSubscriberCount = Math.max(
        0,
        projectGpuLayoutStoreSyncSubscriberCount - 1,
      );
      if (projectGpuLayoutStoreSyncSubscriberCount === 0) {
        projectGpuLayoutStoreSyncUnsubscribe?.();
        projectGpuLayoutStoreSyncUnsubscribe = null;
      }
    };
  }, [layoutStore]);
}
