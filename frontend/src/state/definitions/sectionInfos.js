import { temporal } from "zundo";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

export const useSectionInfos = createProjectState(
  temporal(
    subscribeWithSelector(
      immer(() => ({
        x: {},
        version: 0,
      })),
    ),
  ),
);
