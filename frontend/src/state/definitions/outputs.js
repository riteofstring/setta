import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

export const useOutputs = createProjectState(
  immer(() => ({
    x: {},
  })),
);
