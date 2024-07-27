import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

export const useOutputGroups = createProjectState(
  immer(() => ({
    x: {},
  })),
);
