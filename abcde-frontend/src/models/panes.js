import { MIN_PANE_WIDTH, OVERVIEW, UI_EDITOR } from "utils/constants";
import { immer } from "zustand/middleware/immer";
import { create } from "./utils";

export const usePanes = create(
  immer((set) => ({
    vis: { [OVERVIEW]: true, [UI_EDITOR]: false },
    width: { [OVERVIEW]: 320, [UI_EDITOR]: 500 },
    trueWidth: { [OVERVIEW]: 320, [UI_EDITOR]: MIN_PANE_WIDTH },

    setVis: ({ paneName, vis }) =>
      set((state) => {
        state.vis[paneName] = vis;
      }),

    setWidth: ({ paneName, width }) =>
      set((state) => {
        state.width[paneName] = width;
      }),

    setTrueWidth: ({ paneName, trueWidth }) =>
      set((state) => {
        state.trueWidth[paneName] = trueWidth;
      }),
  }))
);
