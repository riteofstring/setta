import { create } from "./utils";

const initialState = {
  settingsLoaded: false,
  darkMode: false,
  snapToGrid: false,
};

export const useSettings = create((set) => ({
  ...initialState,
  setSettings: (payload) => set({ ...payload, settingsLoaded: true }),
  toggleSetting: (settingName) =>
    set((state) => ({ [settingName]: !state[settingName] })),
}));
