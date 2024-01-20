import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

const initialState = {
  x: {},
  version: 0,
};

export const useParamSweep = createProjectState(
  temporal(
    immer((set) => ({
      ...initialState,
    }))
  )
);

useParamSweep.temporal.getState().pause();
