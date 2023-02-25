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
    initDescriptions: ({ descriptionIds }) =>
      set((state) => {
        descriptionIds.forEach(
          (id) => (state.x[id] = newSectionDescription({ height: 100 }))
        );
      }),
    setDescription: ({ descriptionId, value }) =>
      set((state) => {
        state.x[descriptionId].value = value;
      }),
    setHeight: ({ descriptionId, height }) =>
      set((state) => {
        state.x[descriptionId].height = height;
      }),
    toggleVisible: ({ descriptionId }) =>
      set((state) => {
        state.x[descriptionId].visible = !state.x[descriptionId].visible;
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
