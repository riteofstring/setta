import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import {
  ProjectConfigFrontendType,
  ProjectConfigZustandType,
} from "z_utils/types/projectConfig";
import { createProjectState } from "./utils";

const initialState: ProjectConfigFrontendType = {
  id: "",
  name: "",
  version: 0,
};

export const useProjectConfig = createProjectState(
  temporal(
    immer<ProjectConfigZustandType>((set, get) => ({
      ...initialState,
      resetAndSetAll: (payload) =>
        set((state) => ({ ...state, ...payload }), true),
      setName: (name) => set({ name }),
      getAll: () => _.pick(get(), ["id", "name"]),
    })),
  ),
);
