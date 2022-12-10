import _ from "lodash";
import { create } from "../utils";

const initialState = {
  id: null,
  name: "",
  sectionConfigCol: null,
  childrenId: null,
  children: [],
};

export const useProjectConfig = create((set, get) => ({
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
  getAll: () => _.pick(get(), _.keys(initialState)),
}));
