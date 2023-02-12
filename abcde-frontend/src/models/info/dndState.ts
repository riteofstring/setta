import { DropType } from "utils/DNDSortable/dropTypes";
import { create } from "../utils";

export const initialState = {
  active: null,
  activeIsTopLevel: false,
  over: null,
  overDropType: DropType.NONE,
  centerYCondition: false,
};

export const useDndState = create((set) => ({
  ...initialState,
  setActive: ({ id, isTopLevel }) =>
    set({ active: id, activeIsTopLevel: isTopLevel }),
  setOver: (props) => set(props),
  reset: () => set(initialState),
}));
