import { CLOSED_PANE_WIDTH, OVERVIEW, UI_EDITOR } from "utils/constants";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

type PanesStateType = {
  vis: { [OVERVIEW]: boolean; [UI_EDITOR]: boolean };
  width: { [OVERVIEW]: number; [UI_EDITOR]: number };
  trueWidth: { [OVERVIEW]: number; [UI_EDITOR]: number };
};

type PanesActionType = {
  setVis: (payload: { paneName: string; vis: boolean }) => void;
  setTrueWidth: (payload: { paneName: string; trueWidth: number }) => void;
};

type PanesZustandType = PanesStateType & PanesActionType;

export const usePanes = createProjectState(
  immer<PanesZustandType>((set) => ({
    vis: { [OVERVIEW]: true, [UI_EDITOR]: false },
    width: { [OVERVIEW]: 335, [UI_EDITOR]: 500 },
    trueWidth: { [OVERVIEW]: 335, [UI_EDITOR]: CLOSED_PANE_WIDTH },
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
    setAll: ({ vis, width }) =>
      set((state) => {
        state.vis = vis;

        for (const k of [OVERVIEW, UI_EDITOR]) {
          if (width[k]) {
            state.width[k] = width[k];
          }
          state.trueWidth[k] = vis[k] ? width[k] : CLOSED_PANE_WIDTH;
        }
      }),
  })),
);
