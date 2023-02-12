import { create } from "../utils";

export enum DropType {
  NONE = "NONE",
  INTO = "INTO",
  ABOVE = "ABOVE",
  BELOW = "BELOW",
}

export const initialState = {
  active: null,
  activeIsTopLevel: false,
  over: null,
  overDropType: DropType.NONE,
};

export const useDndState = create((set) => ({
  ...initialState,
  setActive: ({ id, isTopLevel }) =>
    set({ active: id, activeIsTopLevel: isTopLevel }),
  setOver: (props) => set(props),
  reset: () => set(initialState),
}));
