import { create } from "./utils";

const initialState = { darkMode: false };

export const useUserSettings = create((set) => ({
  ...initialState,
  setDarkMode: (darkMode) => set({ darkMode }),
}));
