import { temporal } from "zundo";
import { createProjectState } from "./utils";

export const useStateVersion = createProjectState(
  temporal(() => ({
    version: 0,
  })),
);
