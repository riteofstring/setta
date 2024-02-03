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
  children: [],
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
          state.children = [...state.children, ...payload];
        }),
      deleteChildren: (payload) =>
        set((state) => {
          state.children = state.children.filter((x) => !payload.includes(x));
        }),
      setName: (name) => set({ name }),
      getAll: () => _.pick(get(), ["id", "name", "children"]),
    })),
  ),
);

useProjectConfig.temporal.getState().pause();
