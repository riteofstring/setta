import {
  SectionConfigStateType,
  SectionConfigZustandType,
} from "abcde-utils/src/types/sectionConfig";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

const initialState: SectionConfigStateType = { x: {} };

export const useSectionConfigs = createProjectState(
  immer<SectionConfigZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
    },
    setSectionConfig: (payload) => set((state) => ({ x: payload(state.x) })),
    setSectionConfigAttr: ({ configId, attr, value }) =>
      set((state) => {
        state.x[configId][attr] = value;
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
