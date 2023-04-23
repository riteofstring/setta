import {
  ProjectConfigType,
  ProjectConfigZustandType,
} from "abcde-utils/src/types/projectConfig";
import _ from "lodash";
import { createProjectState } from "../utils";

const initialState: ProjectConfigType = {
  id: "",
  name: "",
  sectionConfigCol: "",
  childrenId: "",
  children: [],
  isDefault: false,
};

export const useProjectConfig = createProjectState<ProjectConfigZustandType>(
  (set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll(payload);
    },
    addChildren: (payload) =>
      set((state) => ({ children: _.uniq([...state.children, ...payload]) })),
    deleteChildren: (payload) =>
      set((state) => ({
        children: state.children.filter((x) => !payload.includes(x)),
      })),
    setName: (name) => set({ name }), //TODO, need to update db
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
    getAll: () =>
      _.pick(get(), [
        "id",
        "name",
        "sectionConfigCol",
        "childrenId",
        "children",
        "isDefault",
      ]),
  })
);
