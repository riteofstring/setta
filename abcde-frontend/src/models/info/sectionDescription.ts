import { newSectionDescription } from "abcde-utils/src/objs/sectionDescription";
import {
  SectionDescriptionStateType,
  SectionDescriptionZustandType,
} from "abcde-utils/src/types/sectionDescription";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

const initialState: SectionDescriptionStateType = { x: {} };

export const useSectionDescription = create(
  immer<SectionDescriptionZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
    },
    initDescriptions: ({ sectionIds }) =>
      set((state) => {
        sectionIds.forEach(
          (id) => (state.x[id] = newSectionDescription({ height: 100 }))
        );
      }),
    setDescription: ({ sectionId, value }) =>
      set((state) => {
        state.x[sectionId].value = value;
      }),
    setHeight: ({ sectionId, height }) =>
      set((state) => {
        state.x[sectionId].height = height;
      }),
    toggleVisible: ({ sectionId }) =>
      set((state) => {
        state.x[sectionId].visible = !state.x[sectionId].visible;
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
