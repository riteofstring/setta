import { getActiveSectionUIIds } from "state/activeSectionUI";
import { getSectionBounds } from "./flowGeometry";
import type { GpuPoint, GpuRect } from "./viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "./viewportStore";

type GpuSelectionBoundsOptions = {
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

const EMPTY_SELECTION_BOUNDS: GpuRect = {
  height: 0,
  width: 0,
  x: 0,
  y: 0,
};

export function updateActiveNodesSelectionBounds(
  options: GpuSelectionBoundsOptions = {},
): void {
  updateNodesSelectionBoundsForSections(getActiveSectionUIIds(), options);
}

export function updateNodesSelectionBoundsForSections(
  sectionIds: readonly string[],
  options: GpuSelectionBoundsOptions = {},
): void {
  const store = resolveViewportStore(options.store);
  if (sectionIds.length === 0) {
    store.getState().setNodesSelectionBounds(null);
    return;
  }
  store
    .getState()
    .setNodesSelectionBounds(
      getSectionBounds(sectionIds) ?? EMPTY_SELECTION_BOUNDS,
    );
}

export function clearNodesSelectionBounds(
  options: GpuSelectionBoundsOptions = {},
): void {
  resolveViewportStore(options.store).getState().setNodesSelectionBounds(null);
}

export function shiftNodesSelectionBounds(
  delta: GpuPoint,
  options: GpuSelectionBoundsOptions = {},
): boolean {
  const store = resolveViewportStore(options.store);
  const bounds = store.getState().nodesSelectionBounds;
  if (!bounds) {
    return false;
  }
  store.getState().setNodesSelectionBounds({
    ...bounds,
    x: bounds.x + delta.x,
    y: bounds.y + delta.y,
  });
  return true;
}

function resolveViewportStore(
  store: GpuFlowViewportStoreApi | undefined,
): GpuFlowViewportStoreApi {
  return store ?? gpuFlowViewportStore;
}
