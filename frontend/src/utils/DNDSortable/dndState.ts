import { createProjectState } from "models/utils";
import { immer } from "zustand/middleware/immer";

const initialState = {
  sectionId: null,
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
};

export const useDndState = createProjectState(
  immer((set) => ({
    ...initialState,
    setActive: ({ sectionId, isTopLevel, width, height }) =>
      set((state) => ({
        sectionId,
        activeId: state.isSorting ? sectionId : getDndSectionId(sectionId),
        activeIsTopLevel: isTopLevel,
        width,
        height,
      })),
    setOver: (props) => set(props),
    activateSortingMode: () =>
      set((state) => {
        if (!state.isMovingFree && !state.activeIsTopLevel) {
          return { isSorting: true };
        }
        return { isSorting: false };
      }),
    deactivateSortingMode: () => set({ isSorting: false }),
    activateMovingFreeMode: () =>
      set((state) => {
        if (!state.isSorting) {
          return { isMovingFree: true };
        }
        return { isMovingFree: false };
      }),
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
  })),
);

const dndIdSuffix = "-TempDND";

export function getDndSectionId(sectionId) {
  return `${sectionId}${dndIdSuffix}`;
}

export function getActualSectionId(dndSectionId) {
  return dndSectionId.slice(0, -dndIdSuffix.length);
}
