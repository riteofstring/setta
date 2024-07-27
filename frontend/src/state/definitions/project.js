import { createProjectState } from "./utils";

export const useProject = createProjectState(() => ({
  id: "",
  name: "",
  defaultConfigId: null,
}));
