import { create } from "./utils";

export const useSearch = create((set) => ({
  value: "",
  setValue: (value) => set({ value }),
  reset: () => set({ value: "" }),
}));
