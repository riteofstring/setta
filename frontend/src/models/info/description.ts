import { createProjectState } from "../utils";

export const useDescription = createProjectState((set) => ({
  setDescription: (id, description) => set({ [id]: description }),
}));
