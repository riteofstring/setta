import { useEffect } from "react";

import type { GpuFlowLayoutStoreApi } from "../layoutStore";
import { scheduleGpuFlowPortLocalRectUpdate } from "../ports/portGeometry";

export function useGpuFlowPortLocalRectSync(
  layoutStore: GpuFlowLayoutStoreApi | undefined,
): void {
  useEffect(() => {
    if (!layoutStore) {
      return;
    }
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
      scheduleGpuFlowPortLocalRectUpdate(change.changedNodeIds);
    });
  }, [layoutStore]);
}
