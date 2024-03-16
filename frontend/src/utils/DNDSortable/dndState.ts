import { createProjectState } from "models/utils";

const initialState = {
  activeId: null,
  activeIsTopLevel: false,
  overId: null,
  shouldDrop: false,
  leftDistCondition: false,
  isSorting: false,
  isMovingFree: false,
};

export const useDndState = createProjectState((set) => ({
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
}));
