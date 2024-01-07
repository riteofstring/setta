import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import {
  CodeInfoStateFrontendType,
  CodeInfoZustandType,
} from "z_utils/types/codeInfo";
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
      addCodeInfo: ({ info, parent }) =>
        set((state) => {
          state.x[info.id] = info;
          if (parent) {
            state.x[parent].children.push(info.id);
          }
        }),
      setName: ({ id, name }) =>
        set((state) => {
          state.x[id].name = name;
        }),
      setDescription: ({ id, description }) =>
        set((state) => {
          state.x[id].description = description;
        }),
      togglePinned: (id) =>
        set((state) => {
          state.x[id].isPinned = !state.x[id].isPinned;
        }),
      toggleSelected: (id) =>
        set((state) => {
          state.x[id].isSelected = !state.x[id].isSelected;
        }),
      clearSelected: () =>
        set((state) => {
          for (const [id, c] of Object.entries(state.x)) {
            if (c.isSelected) {
              state.x[id].isSelected = false;
            }
          }
        }),
      setIsFrozen: ({ ids, isFrozen }) =>
        set((state) => {
          for (const id of ids) {
            state.x[id].isFrozen = isFrozen;
          }
        }),
      deleteInfo: ({ ids, parent }) =>
        set((state) => {
          state.x = _.omit(state.x, [id]);
          if (parent) {
            state.x[parent].children = state.x[parent].children.filter(
              (y) => y !== id
            );
          }
        }),
      update: (payload) =>
        set((state) => {
          state.x = { ...state.x, ...payload };
        }),
    }))
  )
);

useCodeInfo.temporal.getState().pause();
