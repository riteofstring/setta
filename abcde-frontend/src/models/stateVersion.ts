import { create } from "./utils";

export const useStateVersion = create((set) => ({
  version: 0,
  reset: () => set({ version: 0 }),
}));
