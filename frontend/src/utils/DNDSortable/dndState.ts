import { createProjectState } from "models/utils";

const initialState = {
  activeId: null,
  activeIsTopLevel: false,
  overId: null,
  shouldDrop: false,
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
      leftDistCondition: state.leftDistCondition,
    })),
}));
