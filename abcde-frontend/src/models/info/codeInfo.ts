import {
  CodeInfoStateType,
  CodeInfoZustandType,
} from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

// allCodeInfo maps from every objInfo key to its objInfo
const initialState: CodeInfoStateType = {
  allCodeInfo: {},
};

export const useCodeInfo = create(
  immer<CodeInfoZustandType>((set, get) => ({
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
