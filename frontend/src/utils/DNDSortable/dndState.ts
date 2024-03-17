import { createProjectState } from "models/utils";
import { immer } from "zustand/middleware/immer";

const initialState = {
  activeId: null,
  activeIsTopLevel: false,
  overId: null,
  leftDistCondition: false,
  isSorting: false,
  isMovingFree: false,
  movingFreeInSortable: false,
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
    setOver: (props) => set(props),
    activateSortingMode: () => set({ isSorting: true }),
    deactivateSortingMode: () => set({ isSorting: false }),
    activateMovingFreeMode: () => set({ isMovingFree: true }),
    deactivateMovingFreeMode: () => set({ isMovingFree: false }),
    reset: () =>
      set((state) => ({
        ...initialState,
        leftDistCondition: state.leftDistCondition,
      })),
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

export function getActualSectionId(dndSectionId) {
  return dndSectionId.slice(0, -dndIdSuffix.length);
}

export function isTempSection(sectionId) {
  return sectionId.slice(-dndIdSuffix.length) === dndIdSuffix;
}
