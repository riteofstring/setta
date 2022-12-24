import { newSectionConfig } from "abcde-utils/src/objs/sectionConfig";
import {
  SectionConfigStateType,
  SectionConfigZustandType,
} from "abcde-utils/src/types/sectionConfig";
import _ from "lodash";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

const initialState: SectionConfigStateType = { x: {} };

export const useSectionConfigs = create(
  immer<SectionConfigZustandType>((set, get) => ({
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
