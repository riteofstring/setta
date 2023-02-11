import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

export enum DropType {
  NONE = "NONE",
  INTO = "INTO",
  ABOVE = "ABOVE",
  BELOW = "BELOW",
}

const initialState = {
  active: null,
  over: null,
  parent: null,
  overDropType: DropType.NONE,
  parentDropType: DropType.NONE,
};

export const useDndState = create(
  immer((set) => ({
    ...initialState,
    setActive: (id) => set({ active: id }),
    setOver: (props) => set(props),
    reset: () => set(initialState),
  }))
);
