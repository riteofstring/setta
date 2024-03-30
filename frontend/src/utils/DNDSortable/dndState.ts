import _ from "lodash";
import { createProjectState } from "models/utils";
import { immer } from "zustand/middleware/immer";

const initialState = {
  activeId: null,
  activeIsTopLevel: false,
  overId: null,
  leftDistCondition: false,
  isSorting: false,
  isMovingFree: false,
  disabled: {},
  width: null,
  height: null,
  times: {},
};

export const useDndState = createProjectState(
  immer((set) => ({
    ...initialState,
    setActive: ({ id, isTopLevel, width, height }) =>
      set({ activeId: id, activeIsTopLevel: isTopLevel, width, height }),
    activateSortingMode: () => set({ isSorting: true, isMovingFree: false }),
    deactivateSortingMode: () => set({ isSorting: false }),
    activateMovingFreeMode: () => set({ isMovingFree: true, isSorting: false }),
    deactivateMovingFreeMode: () => set({ isMovingFree: false }),
    reset: () => set({ ...initialState }),
    setDisabled: (sectionId, disabled) =>
      set((state) => {
        state.disabled[sectionId] = disabled;
      }),
    setTime: (sectionId) =>
      set((state) => {
        state.times[sectionId] = Date.now();
      }),
  })),
);

const dndIdSuffix = "-TempDND";

export function getDndSectionId(sectionId) {
  return `${sectionId}${dndIdSuffix}`;
}

export function isTempSection(sectionId) {
  return sectionId.slice(-dndIdSuffix.length) === dndIdSuffix;
}

export function useDndMode() {
  return useDndState(
    (x) => ({
      isSorting: x.isSorting,
      isMovingFree: x.isMovingFree,
    }),
    _.isEqual,
  );
}
