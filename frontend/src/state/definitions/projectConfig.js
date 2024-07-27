import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "./utils";

export const useProjectConfig = createProjectState(
  temporal(
    immer(() => ({
      id: "",
      name: "",
      version: 0,
    })),
  ),
);
