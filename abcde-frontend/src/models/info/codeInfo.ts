import {
  CodeInfoStateFrontendType,
  CodeInfoZustandType,
} from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

// allCodeInfo maps from every objInfo key to its objInfo
const initialState: CodeInfoStateFrontendType = {
  allCodeInfo: {},
  version: 0,
};

export const useCodeInfo = createProjectState(
  temporal(
    immer<CodeInfoZustandType>((set) => ({
      ...initialState,
      resetAndSetAll: (payload) => {
        set((state) => ({ ...state, ...payload }), true);
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
      update: (payload) =>
        set((state) => {
          state.allCodeInfo = { ...state.allCodeInfo, ...payload.allCodeInfo };
        }),
    }))
  )
);

useCodeInfo.temporal.getState().pause();
