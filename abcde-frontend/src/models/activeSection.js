import create from "zustand";

export const useActiveSection = create((set) => ({
  id: null,
  setId: (payload) => set(() => ({ id: payload })),
}));
