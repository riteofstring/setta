import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

export const useEVCols = createProjectState(
  temporal(
    immer(() => ({
      x: {},
      version: 0,
    })),
  ),
);
