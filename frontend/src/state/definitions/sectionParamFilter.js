import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

export const useSectionParamFilter = createProjectState(
  immer(() => ({
    x: {},
  })),
);
