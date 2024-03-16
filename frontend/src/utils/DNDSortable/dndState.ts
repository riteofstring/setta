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
};

export const useDndState = createProjectState(
  immer((set) => ({
    ...initialState,
    setActive: ({ id, isTopLevel }) =>
      set({ activeId: id, activeIsTopLevel: isTopLevel }),
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
  })),
);
