import { createProjectState } from "../utils";

const initialState = {
  activeId: null,
  activeIsTopLevel: false,
  overId: null,
  shouldDrop: false,
  centerYCondition: false,
  leftDistCondition: false,
};

export const useDndState = createProjectState((set) => ({
  ...initialState,
  setActive: ({ id, isTopLevel }) =>
    set({ activeId: id, activeIsTopLevel: isTopLevel }),
  setOver: (props) => set(props),
  reset: () =>
    set((state) => ({
      ...initialState,
      centerYCondition: state.centerYCondition,
      leftDistCondition: state.leftDistCondition,
    })),
}));
