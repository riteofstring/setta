import { LOGIN } from "utils/pageNames";
import create from "zustand";

export const useCurrPage = create((set) => ({
  name: LOGIN,
  setName: (payload) => set(() => ({ name: payload })),
}));
