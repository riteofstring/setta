import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./definitions/utils";

export const useActiveSection = createProjectState(
  temporal(() => ({
    ids: [],
    version: 0,
  })),
);

export const useCodeInfo = createProjectState(
  temporal(
    immer(() => ({
      x: {},
      version: 0,
    })),
  ),
);
