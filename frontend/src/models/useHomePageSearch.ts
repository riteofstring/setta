import { create } from "./utils";

export const useHomePageSearch = create((set) => ({
  value: "",
  setValue: (value) => set({ value }),
}));
