import { newSectionConfig } from "classes/mutableInfo";
import _ from "lodash";
import create from "zustand";
import { immer } from "zustand/middleware/immer";

const initialState = { x: {} };

export const useSectionConfigs = create(
  immer((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const sectionConfigInfos = _.mapValues(payload, (x) =>
        newSectionConfig(x)
      );
      const s = get();
      s.reset();
      s.setAll({ x: sectionConfigInfos });
    },
    setSectionConfig: (payload) => set((state) => ({ x: payload(state.x) })),
    setSectionConfigAttr: ({ configId, attr, value }) =>
      set((state) => {
        state.x[configId][attr] = value;
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
    getAll: () => get().x,
  }))
);
