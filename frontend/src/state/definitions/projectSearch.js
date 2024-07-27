import { createProjectState } from "./utils";

export const useProjectSearch = createProjectState(() => ({
  sections: [],
  codeInfo: [],
}));
