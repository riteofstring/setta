import { MIN_PANE_WIDTH, OVERVIEW, UI_EDITOR } from "utils/constants";
import { immer } from "zustand/middleware/immer";
import { create } from "./utils";

type PanesStateType = {
  vis: { [OVERVIEW]: boolean; [UI_EDITOR]: boolean };
  trueWidth: { [OVERVIEW]: number; [UI_EDITOR]: number };
};

type PanesActionType = {
  setVis: (payload: { paneName: string; vis: boolean }) => void;
  setTrueWidth: (payload: { paneName: string; trueWidth: number }) => void;
};

type PanesZustandType = PanesStateType & PanesActionType;

export const usePanes = create(
  immer<PanesZustandType>((set) => ({
    vis: { [OVERVIEW]: true, [UI_EDITOR]: false },
    trueWidth: { [OVERVIEW]: 320, [UI_EDITOR]: MIN_PANE_WIDTH },

    setVis: ({ paneName, vis }) =>
      set((state) => {
        state.vis[paneName] = vis;
      }),

    setTrueWidth: ({ paneName, trueWidth }) =>
      set((state) => {
        state.trueWidth[paneName] = trueWidth;
      }),
  }))
);
