import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

export enum ConstantInfoView {
  OVERVIEW = "OVERVIEW",
}

const constantInfoViews = {
  [ConstantInfoView.OVERVIEW]: "Click on a section name to pan to it.",
};

const initialState = { x: constantInfoViews, currId: null };

export const useInfoView = create(
  immer((set) => ({
    ...initialState,
    setInfo: ({ id, value }) =>
      set((state) => {
        state.x[id] = value;
      }),
    setCurr: (id) =>
      set((state) => {
        state.currId = id;
      }),
  }))
);

export function useSetCurrInfoView(id) {
  const setCurr = useInfoView((x) => x.setCurr);

  function onMouseOver() {
    setCurr(id);
  }

  function onMouseLeave() {
    setCurr(null);
  }

  return { onMouseOver, onMouseLeave };
}

export function useCurrInfoView() {
  return useInfoView((x) => (x.currId ? x.x[x.currId] : ""));
}
