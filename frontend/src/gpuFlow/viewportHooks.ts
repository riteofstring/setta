import { useStoreWithEqualityFn } from "zustand/traditional";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "./viewportStore";

export function useGpuFlowViewportStore<T>(
  selector: (state: GpuFlowViewportStore) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useGpuFlowViewportStoreApi(gpuFlowViewportStore, selector, equalityFn);
}

function useGpuFlowViewportStoreApi<T>(
  store: GpuFlowViewportStoreApi,
  selector: (state: GpuFlowViewportStore) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useStoreWithEqualityFn(store, selector, equalityFn);
}
