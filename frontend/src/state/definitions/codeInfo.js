import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

export const useCodeInfo = createProjectState(
  temporal(
    immer(() => ({
      x: {},
      version: 0,
    })),
  ),
);
