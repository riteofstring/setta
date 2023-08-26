import {
  CodeInfoStateFrontendType,
  CodeInfoZustandType,
} from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

// x maps from every objInfo key to its objInfo
const initialState: CodeInfoStateFrontendType = {
  x: {},
  version: 0,
};

export const useCodeInfo = createProjectState(
  temporal(
    immer<CodeInfoZustandType>((set) => ({
      ...initialState,
      resetAndSetAll: (payload) => {
        set((state) => ({ ...state, x: payload }), true);
      },
      setCodeInfo: ({ info }) =>
        set((state) => {
          state.x[info.id] = info;
        }),
      setName: ({ id, name }) =>
        set((state) => {
          state.x[id].name = name;
        }),
      deleteInfos: ({ ids }) =>
        set((state) => {
          state.x = _.omit(state.x, ids);
        }),
      update: (payload) =>
        set((state) => {
          state.x = { ...state.x, ...payload };
        }),
    }))
  )
);

useCodeInfo.temporal.getState().pause();
