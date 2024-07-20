import { temporal } from "zundo";
import { createProjectState } from "./utils";

export const useActiveSection = createProjectState(
  temporal(() => ({
    ids: [],
    version: 0,
  })),
);
