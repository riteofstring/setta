import {
  ProjectConfigType,
  ProjectConfigZustandType,
} from "abcde-utils/src/types/projectConfig";
import _ from "lodash";
import { create } from "../utils";

const initialState: ProjectConfigType = {
  id: "",
  name: "",
  sectionConfigCol: "",
  childrenId: "",
  children: [],
};

export const useProjectConfig = create<ProjectConfigZustandType>(
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
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
    getAll: () =>
      _.pick(get(), [
        "id",
        "name",
        "sectionConfigCol",
        "childrenId",
        "children",
      ]),
  })
);
