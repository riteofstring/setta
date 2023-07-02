import { create } from "./utils";

export const useReactFlowStore = create((set) => ({
  store: null,
  setStore: (payload) => set({ store: payload }),
}));
