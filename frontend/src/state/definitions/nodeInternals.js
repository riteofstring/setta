import { temporal } from "zundo";
import { createProjectState } from "./utils";

export const useNodeInternals = createProjectState(
  temporal(() => ({
    x: new Map(),
    version: 0,
  })),
);
