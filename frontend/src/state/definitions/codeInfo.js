import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

// x maps from every objInfo key to its objInfo
const initialState = { x: {}, version: 0 };

export const useCodeInfo = createProjectState(
  temporal(
    immer((set) => ({
      ...initialState,
      resetAndSetAll: (payload) => {
        set((state) => ({ ...state, x: payload }), true);
      },
      addCodeInfo: ({ info, parent, insertIdx }) =>
        set((state) => {
          state.x[info.id] = info;
          if (parent) {
            if (insertIdx === null) {
              state.x[parent].children.push(info.id);
            } else {
              state.x[parent].children.splice(insertIdx, 0, info.id);
            }
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
      setIsFrozen: ({ ids, isFrozen }) =>
        set((state) => {
          for (const id of ids) {
            state.x[id].isFrozen = isFrozen;
          }
        }),
      deleteInfo: ({ ids, parent }) =>
        set((state) => {
          state.x = _.omit(state.x, ids);
          if (parent) {
            state.x[parent].children = state.x[parent].children.filter(
              (y) => !ids.includes(y),
            );
          }
        }),
      update: (payload) =>
        set((state) => {
          state.x = { ...state.x, ...payload };
        }),
      batchUpdateChildren: (payload) =>
        set((state) => {
          for (const [id, newChildren] of Object.entries(payload)) {
            state.x[id].children = newChildren;
          }
        }),
    })),
  ),
);
