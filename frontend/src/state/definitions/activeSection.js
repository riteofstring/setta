import _ from "lodash";
import { temporal } from "zundo";
import { createProjectState } from "./utils";

const initialState = { ids: [], version: 0 };

export const useActiveSection = createProjectState(
  temporal((set) => ({
    ...initialState,
    setIds: (payload) => set({ ids: payload }),
    addIds: (payload) =>
      set((state) => ({ ids: [...new Set([...state.ids, ...payload])] })),
    removeIds: (payload) =>
      set((state) => ({ ids: _.difference(state.ids, payload) })),
    clear: () => set({ ids: [] }),
  })),
);
