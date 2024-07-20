import { createNewId } from "z_utils/utils";
import { create } from "./utils";

export const useInteractive = create(() => ({
  id: createNewId(),
  projects: new Set(),
  currProjectIsInteractive: false,
  data: null,
}));
