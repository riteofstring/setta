import { createNewId } from "z_utils/utils";
import { create } from "./utils";

const initialState = {
  id: createNewId(),
  projects: new Set(),
  currProjectIsInteractive: false,
  data: null,
};

export const useInteractive = create((set) => ({
  ...initialState,
  setProjects: (payload) => set({ projects: new Set(payload) }),
  setCurrProjectIsInteractive: (projectName) =>
    set((state) => {
      return { currProjectIsInteractive: state.projects.has(projectName) };
    }),
  setData: (payload) => set({ data: payload }),
}));
