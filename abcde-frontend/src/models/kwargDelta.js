import { immer } from "zustand/middleware/immer";
import { create } from "./utils";

export const ADDED = "ADDED";
export const DELETED = "DELETED";
export const UNCHANGED = "UNCHANGED";

export const useKwargDelta = create(
  immer((set) => ({
    x: {},
    setDelta: ({ sectionId, objInfoId, value }) =>
      set((state) => {
        if (!(sectionId in state.x)) {
          state.x[sectionId] = {};
        }
        state.x[sectionId][objInfoId] = value;
      }),
  }))
);
