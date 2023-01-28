import { ProjectType, ProjectZustandType } from "abcde-utils/src/types/project";
import _ from "lodash";
import { create } from "../utils";

const initialState: ProjectType = {
  id: "",
  name: "",
  defaultConfigId: "",
};

export const useProject = create<ProjectZustandType>((set, get) => ({
  ...initialState,
  resetAndSetAll: (payload) => {
    const s = get();
    s.reset();
    s.setAll(payload);
  },
  setAll: (payload) => set(payload),
  reset: () => set(initialState),
  getAll: () => _.pick(get(), ["id", "name", "defaultConfigId"]),
}));
