import { create } from "./utils";

export const useInteractive = create((set) => ({
  projects: new Set(),
  currProjectIsInteractive: false,
  setProjects: (payload) => set({ projects: new Set(payload) }),
  setCurrProjectIsInteractive: (projectName) =>
    set((state) => {
      return { currProjectIsInteractive: state.projects.has(projectName) };
    }),
}));
