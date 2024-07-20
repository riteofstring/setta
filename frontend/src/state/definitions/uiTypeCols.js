import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

export const useUITypeCols = createProjectState(
  temporal(
    immer(() => ({
      y: {},
      version: 0,
    })),
  ),
);
