import { DropType } from "utils/DNDSortable/dropTypes";
import { create } from "../utils";

export const initialState = {
  activeId: null,
  activeIsTopLevel: false,
  overId: null,
  overDropType: DropType.NONE,
  centerYCondition: false,
  leftDistCondition: false,
};

export const useDndState = create((set) => ({
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
