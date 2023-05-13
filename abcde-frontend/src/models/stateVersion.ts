import { temporal } from "zundo";
import { createProjectState } from "./utils";

export const useStateVersion = createProjectState(
  temporal((set) => ({
    version: 0,
    incrementVersion: () => set((state) => ({ version: state.version + 1 })),
    reset: () => set({ version: 0 }),
  }))
);

useStateVersion.temporal.getState().pause();
