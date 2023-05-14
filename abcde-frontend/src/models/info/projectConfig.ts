import {
  ProjectConfigFrontendType,
  ProjectConfigZustandType,
} from "abcde-utils/src/types/projectConfig";
import _ from "lodash";
import { temporal } from "zundo";
import { createProjectState } from "../utils";

const initialState: ProjectConfigFrontendType = {
  id: "",
  name: "",
  sectionConfigCol: "",
  childrenId: "",
  children: [],
  isDefault: false,
  version: 0,
};

export const useProjectConfig = createProjectState(
  temporal<ProjectConfigZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      set((state) => ({ ...state, ...payload }), true);
    },
    addChildren: (payload) =>
      set((state) => ({ children: _.uniq([...state.children, ...payload]) })),
    deleteChildren: (payload) =>
      set((state) => ({
        children: state.children.filter((x) => !payload.includes(x)),
      })),
    setName: (name) => set({ name }), //TODO, need to update db
    getAll: () =>
      _.pick(get(), [
        "id",
        "name",
        "sectionConfigCol",
        "childrenId",
        "children",
        "isDefault",
      ]),
  }))
);

useProjectConfig.temporal.getState().pause();
