import { ProjectType, ProjectZustandType } from "abcde-utils/src/types/project";
import _ from "lodash";
import { createProjectState } from "../utils";

const initialState: ProjectType = {
  id: "",
  name: "",
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
    getAll: () => _.pick(get(), ["id", "name"]),
  })
);
