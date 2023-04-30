import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { create } from "./utils";

export const useZundoTest = create(
  temporal(
    immer((set) => ({
      value: { dog: 0 },
      increment: (key) =>
        set((state) => {
          state.value[key] += 1;
        }),
      decrement: (key) =>
        set((state) => {
          state.value[key] -= 1;
        }),
      reset: () => set({ value: "" }),
    }))
  )
);
