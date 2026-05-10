import { createContext, useContext } from "react";

import type { GpuFlowLayoutStoreApi } from "./layoutStore";

export const GpuFlowLayoutStoreContext =
  createContext<GpuFlowLayoutStoreApi | null>(null);

export function useGpuFlowLayoutStoreContext(): GpuFlowLayoutStoreApi | null {
  return useContext(GpuFlowLayoutStoreContext);
}
