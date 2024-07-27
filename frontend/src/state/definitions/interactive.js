import { createNewId } from "utils/idNameCreation";
import { create } from "./utils";

export const useInteractive = create(() => ({
  id: createNewId(),
  projects: new Set(),
  currProjectIsInteractive: false,
  data: null,
}));
