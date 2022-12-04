import { create } from "./utils";

export const useActiveSection = create((set) => ({
  id: null,
  setId: (payload) => set(() => ({ id: payload })),
}));
