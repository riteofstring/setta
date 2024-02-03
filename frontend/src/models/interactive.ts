import { createNewId } from "z_utils/utils";
import { create } from "./utils";

export const useInteractive = create((set) => ({
  id: createNewId(),
  projects: new Set(),
  currProjectIsInteractive: false,
  data: null,
  setProjects: (payload) => set({ projects: new Set(payload) }),
  setCurrProjectIsInteractive: (projectName) =>
    set((state) => {
      return { currProjectIsInteractive: state.projects.has(projectName) };
    }),
  setData: (payload) => set({ data: payload }),
}));
