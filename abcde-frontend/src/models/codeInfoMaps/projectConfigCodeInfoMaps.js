import create from "zustand";
import { immer } from "zustand/middleware/immer";
import { initialState, setAll } from "./utils";

export const useProjectConfigCodeInfoMaps = create(
  immer((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll(payload);
    },
    setAll: (payload) => set((state) => setAll(state, payload)),
    reset: () => set(initialState),
  }))
);
