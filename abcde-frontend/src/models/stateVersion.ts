import { createProjectState } from "./utils";

export const useStateVersion = createProjectState((set) => ({
  version: 0,
  reset: () => set({ version: 0 }),
}));
