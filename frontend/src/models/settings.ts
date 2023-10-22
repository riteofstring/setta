import { create } from "./utils";

const initialState = {
  settingsLoaded: false,
  darkMode: false,
};

export const useSettings = create((set) => ({
  ...initialState,
  setSettings: (payload) => set({ ...payload, settingsLoaded: true }),
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
}));
