import { immer } from "zustand/middleware/immer";
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
  parent: null,
  overDropType: DropType.NONE,
  parentDropType: DropType.NONE,
  nestedTransitionComplete: false,
};

export const useDndState = create(
  immer((set) => ({
    ...initialState,
    setActive: ({ id, isTopLevel }) =>
      set({ active: id, activeIsTopLevel: isTopLevel }),
    setOver: (props) => set(props),
    setNestedTransitionComplete: (isComplete) =>
      set({ nestedTransitionComplete: isComplete }),
    reset: () => set(initialState),
  }))
);
