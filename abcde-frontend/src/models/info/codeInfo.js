import _ from "lodash";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

// allCodeInfo maps from every objInfo key to its objInfo
// allCollections maps from every collection key to its objInfo
// callables maps from every collection key to a list of objInfo that are callables
const initialState = {
  allCodeInfo: {},
  allCollections: {},
  callables: {},
  params: {},
  paramCollections: {},
};

export const useCodeInfo = create(
  immer((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll(payload);
    },
    setCodeInfo: ({ info }) =>
      set((state) => {
        state.allCodeInfo[info.id] = info;
      }),
    setName: ({ id, name }) =>
      set((state) => {
        state.allCodeInfo[id].name = name;
      }),
    deleteInfos: ({ ids }) =>
      set((state) => {
        state.allCodeInfo = _.omit(state.allCodeInfo, ids);
      }),
    updateInfos: (payload) =>
      set((state) => {
        for (const k of Object.keys(initialState)) {
          state[k] = { ...state[k], ...payload[k] };
        }
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
