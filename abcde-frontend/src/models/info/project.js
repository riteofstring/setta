import _ from "lodash";
import { create } from "../utils";

const initialState = {
  id: null,
  name: "",
  defaultConfigId: null,
};

export const useProject = create((set, get) => ({
  ...initialState,
  resetAndSetAll: (payload) => {
    const s = get();
    s.reset();
    s.setAll(payload);
  },
  setAll: (payload) => set(payload),
  reset: () => set(initialState),
  getAll: () => _.pick(get(), Object.keys(initialState)),
}));
