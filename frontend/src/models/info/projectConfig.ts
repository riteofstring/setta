import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import {
  ProjectConfigFrontendType,
  ProjectConfigZustandType,
} from "z_utils/types/projectConfig";
import { createProjectState } from "../utils";

const initialState: ProjectConfigFrontendType = {
  id: "",
  name: "",
  children: {},
  viewport: { x: 0, y: 0, zoom: 1 },
  version: 0,
};

export const useProjectConfig = createProjectState(
  temporal(
    immer<ProjectConfigZustandType>((set, get) => ({
      ...initialState,
      resetAndSetAll: (payload) =>
        set((state) => ({ ...state, ...payload }), true),
      addChildren: (payload) =>
        set((state) => {
          state.children = { ...state.children, ...payload };
        }),
      deleteChildren: (payload) =>
        set((state) => {
          state.children = _.omit(state.children, payload);
        }),
      updatePositions: (payload) =>
        set((state) => {
          _.forEach(
            payload,
            (v, k) => (state.children[k] = { ...state.children[k], ...v })
          );
        }),
      setName: (name) => set({ name }),
      setViewport: (viewport) => set({ viewport }),
      getAll: () => _.pick(get(), ["id", "name", "children", "viewport"]),
    }))
  )
);

useProjectConfig.temporal.getState().pause();
