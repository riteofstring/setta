import { useEffect } from "react";

import type { GpuFlowLayoutStoreApi } from "../layoutStore";
import { scheduleGpuFlowPortLocalRectUpdate } from "../ports/portGeometry";

type GpuFlowPortLocalRectSyncOptions = {
  readonly enabled?: boolean | undefined;
  readonly schedulePortLocalRectUpdate?:
    | ((nodeIds: readonly string[]) => void)
    | undefined;
};

export function useGpuFlowPortLocalRectSync(
  layoutStore: GpuFlowLayoutStoreApi | undefined,
  options: GpuFlowPortLocalRectSyncOptions = {},
): void {
  const enabled = options.enabled ?? true;
  const schedulePortLocalRectUpdate =
    options.schedulePortLocalRectUpdate ?? scheduleGpuFlowPortLocalRectUpdate;

  useEffect(() => {
    if (!layoutStore || !enabled) {
      return;
    }
    return attachGpuFlowPortLocalRectSync(
      layoutStore,
      schedulePortLocalRectUpdate,
    );
  }, [enabled, layoutStore, schedulePortLocalRectUpdate]);
}

function attachGpuFlowPortLocalRectSync(
  layoutStore: GpuFlowLayoutStoreApi,
  schedulePortLocalRectUpdate: (
    nodeIds: readonly string[],
  ) => void = scheduleGpuFlowPortLocalRectUpdate,
): () => void {
  return layoutStore.subscribe((state, previousState) => {
    const change = state.lastChange;
    if (
      !change ||
      change === previousState.lastChange ||
      change.changedNodeIds.length === 0
    ) {
      return;
    }
    if (
      !change.dirty.includes("source-size") &&
      !change.dirty.includes("texture-size")
    ) {
      return;
    }
    schedulePortLocalRectUpdate(change.changedNodeIds);
  });
}
