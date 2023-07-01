import {
  ProjectConfigFrontendType,
  ProjectConfigZustandType,
} from "abcde-utils/src/types/projectConfig";
import _ from "lodash";
import { temporal } from "zundo";
import { createProjectState } from "../utils";

const initialState: ProjectConfigFrontendType = {
  id: "",
  name: "",
  children: {},
  version: 0,
};

export const useProjectConfig = createProjectState(
  temporal<ProjectConfigZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      set((state) => ({ ...state, ...payload }), true);
    },
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
    setName: (name) => set({ name }), //TODO, need to update db
    getAll: () => _.pick(get(), ["id", "name", "children"]),
  }))
);

useProjectConfig.temporal.getState().pause();
