import { create } from "./utils";

export const useUIEditor = create((set) => ({
  tabIndex: 0,
  cameFromUIConfig: false,
  setTabIndex: (payload) => set(() => ({ tabIndex: payload })),
  setCameFromUIConfig: (payload) => set(() => ({ cameFromUIConfig: payload })),
}));
