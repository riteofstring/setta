import {
  CodeInfoStateType,
  CodeInfoZustandType,
} from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

// allCodeInfo maps from every objInfo key to its objInfo
const initialState: CodeInfoStateType = {
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
      updateInfos: (payload) =>
        set((state) => {
          for (const k of Object.keys(initialState)) {
            state[k] = { ...state[k], ...payload[k] };
          }
        }),
    }))
  )
);

useCodeInfo.temporal.getState().pause();
