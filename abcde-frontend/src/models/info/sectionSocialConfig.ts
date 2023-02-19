import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

export const SOCIAL_TYPES = {
  youtube: {
    id: "youtube",
    name: "YouTube",
    children: ["url", "timestamp"],
  },
  twitter: {
    id: "twitter",
    name: "Twitter",
    children: ["url"],
  },
};

const initialState = { x: {} };

export const useSectionSocialConfig = create(
  immer((set) => ({
    ...initialState,
    initConfig: ({ sectionId, id }) =>
      set((state) => {
        if (!(sectionId in state.x)) {
          state.x[sectionId] = {};
        }
        if (!(id in state.x[sectionId])) {
          state.x[sectionId][id] = {};
          for (const c of SOCIAL_TYPES[id].children) {
            state.x[sectionId][id][c] = "";
          }
        }
      }),
    setConfig: ({ sectionId, id, attr, value }) =>
      set((state) => {
        state.x[sectionId][id][attr] = value;
      }),
    reset: () => set(initialState),
  }))
);
