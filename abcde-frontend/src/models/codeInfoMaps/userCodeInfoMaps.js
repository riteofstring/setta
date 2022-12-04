import { immer } from "zustand/middleware/immer";
import { create } from "../utils";
import { initialState, setAll } from "./utils";

export const useUserCodeInfoMaps = create(
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
