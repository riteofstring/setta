import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

// This is a special state that maps directly from
// sectionIds to current callables and params

export const useSectionToParams = createProjectState(
  temporal(
    immer(() => ({
      callables: {},
      params: {},
    })),
  ),
);
