import { createProjectState } from "state/definitions/utils";
import { immer } from "zustand/middleware/immer";

export const useOtherProjectConfigs = createProjectState(
  immer((set) => ({
    x: [],
    setOtherConfigs: (payload) => set({ x: payload }),
  })),
);
