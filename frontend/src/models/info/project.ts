import _ from "lodash";
import { ProjectType, ProjectZustandType } from "z_utils/types/project";
import { createProjectState } from "../utils";

const initialState: ProjectType = {
  id: "",
  name: "",
  defaultConfigId: null,
};

export const useProject = createProjectState<ProjectZustandType>(
  (set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll(payload);
    },
    setName: (name) => set({ name }), //TODO, need to update db
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
    getAll: () => _.pick(get(), ["id", "name", "defaultConfigId"]),
  }),
);
