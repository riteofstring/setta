import { createContext, useContext } from "react";

import type { GpuFlowScene } from "./scene";

export type GpuFlowSceneContextValue = {
  readonly getScene: () => GpuFlowScene | null | undefined;
};

export const GpuFlowSceneContext =
  createContext<GpuFlowSceneContextValue | null>(null);

export function useGpuFlowSceneContext(): GpuFlowSceneContextValue | null {
  return useContext(GpuFlowSceneContext);
}
