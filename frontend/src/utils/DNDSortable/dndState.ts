import { createProjectState } from "models/utils";
import { immer } from "zustand/middleware/immer";

const initialState = {
  activeId: null,
  activeIsTopLevel: false,
  overId: null,
  leftDistConditionId: false,
  isSorting: false,
  isMovingFree: false,
  movingFreeInSortable: false,
  disabled: {},
  width: null,
  height: null,
};

export const useDndState = createProjectState(
  immer((set) => ({
    ...initialState,
    setActive: ({ id, isTopLevel, width, height }) =>
      set({ activeId: id, activeIsTopLevel: isTopLevel, width, height }),
    activateSortingMode: () => set({ isSorting: true }),
    deactivateSortingMode: () => set({ isSorting: false }),
    activateMovingFreeMode: () => set({ isMovingFree: true }),
    deactivateMovingFreeMode: () => set({ isMovingFree: false }),
    reset: () => set({ ...initialState }),
    setDisabled: (sectionId, disabled) =>
      set((state) => {
        state.disabled[sectionId] = disabled;
      }),
  })),
);

const dndIdSuffix = "-TempDND";

export function getDndSectionId(sectionId) {
  return `${sectionId}${dndIdSuffix}`;
}

export function getActualSectionId(dndSectionId) {
  return dndSectionId.slice(0, -dndIdSuffix.length);
}

export function isTempSection(sectionId) {
  return sectionId.slice(-dndIdSuffix.length) === dndIdSuffix;
}
